import { test } from "node:test"
import assert from "node:assert/strict"
import { promisify } from "node:util"
import { execFileSync, execFile } from "node:child_process"
import { createServer } from "node:net"
import { readFileSync, readdirSync, writeFileSync, rmSync, realpathSync } from "node:fs"
import { resolve, join, basename, dirname } from "node:path"
import { prepareLocalDatabase } from "../../scripts/prepare-local-db.mjs"

const reservePort = async (port) => {
  const server = createServer()
  await new Promise((resolve, reject) => {
    server.once("error", reject)
    server.listen(port, "0.0.0.0", resolve)
  })
  return server
}

const releasePort = (server) => new Promise((resolve) => server.close(resolve))

test(
  "reconstrói migrações duas vezes e detecta perda de RLS",
  { timeout: 480_000 },
  async (t) => {
    assert.equal(
      process.argv.length,
      2,
      "teste local não aceita destinos ou opções adicionais",
    )
    const workdir = prepareLocalDatabase()
    const cli = resolve("node_modules/supabase/dist/supabase.js")
    const run = (...args) =>
      execFileSync(process.execPath, [cli, ...args, "--workdir", workdir], {
        stdio: "pipe",
        timeout: 180_000,
      })
    let started = false
    t.after(() => {
      try {
        if (started) run("stop", "--no-backup")
      } finally {
        assert.equal(dirname(realpathSync(workdir)), realpathSync(resolve("temp")))
        assert.ok(basename(workdir).startsWith("supabase-run-"))
        rmSync(workdir, { recursive: true, force: true })
      }
    })
    const config = join(workdir, "supabase/config.toml")
    const original = readFileSync(config, "utf8")
    assert.match(original, /^project_id = "circuitone-local"$/m)
    let blocker
    try {
      blocker = await reservePort(55432)
      blocker.unref()
      t.after(() => releasePort(blocker))
    } catch (error) {
      if (error.code !== "EADDRINUSE") throw error
    }
    const dbServer = await reservePort(0)
    let shadowServer
    let dbPort
    let shadowPort
    try {
      shadowServer = await reservePort(0)
      dbPort = dbServer.address().port
      shadowPort = shadowServer.address().port
    } finally {
      await Promise.all([dbServer, shadowServer].filter(Boolean).map(releasePort))
    }
    writeFileSync(
      config,
      original
        .replace('project_id = "circuitone-local"', `project_id = "circuitone-test-${basename(workdir).split("-").at(-1).toLowerCase()}"`)
        .replace(/^port = 55432$/m, `port = ${dbPort}`)
        .replace(/^shadow_port = 55430$/m, `shadow_port = ${shadowPort}`),
    )
    assert.doesNotMatch(readFileSync(config, "utf8"), /^port = 55432$/m)
    const check = () =>
      run(
        "db",
        "query",
        "--local",
        "--file",
        resolve("tests/database/post-migration.sql"),
      )
    const checkDefaults = () =>
      run("db", "query", "--local", "--file", resolve("tests/database/default-grants.sql"))
    const dir = join(workdir, "supabase/migrations")
    // Apenas no banco descartável: simula default legado antes da migração real.
    writeFileSync(
      join(dir, "20260922000000_legacy_default_grants.sql"),
      readFileSync("tests/database/legacy-default-grants.sql"),
    )
    run("migration", "new", "pipeline_probe")
    const file = readdirSync(dir).find((name) =>
      name.endsWith("_pipeline_probe.sql"),
    )
    assert.ok(file)
    // SQL sintético existe apenas na cópia descartável, nunca em docs/migrations.
    writeFileSync(
      join(dir, file),
      readFileSync("tests/database/pipeline-probe.sql"),
    )
    started = true
    run("db", "start")
    for (let attempt = 0; attempt < 2; attempt++) {
      run("db", "reset", "--local")
      check()
      checkDefaults()
      run("db", "query", "--local", "--file", resolve("tests/database/identity-profiles.sql"))
    }
    // Duas conexões reais: lock da identidade e UNIQUE do CPF devem decidir no banco.
    for (const sameAccount of [false, true]) {
      run(
        "db",
        "query",
        "--local",
        `insert into auth.users(id,email,email_confirmed_at,phone,phone_confirmed_at) values
        ('20000000-0000-4000-8000-000000000001','race-1@example.invalid',now(),'5581990000001',now()),
        ('20000000-0000-4000-8000-000000000002','race-2@example.invalid',now(),'5581990000002',now())`,
      )
      const results = await Promise.allSettled(
        [1, 2].map(async (index) => {
          const file = join(workdir, `race-${index}.sql`)
          const actor = sameAccount ? 1 : index
          writeFileSync(
            file,
            `begin; set local role authenticated;
          select set_config('request.jwt.claims','{"sub":"20000000-0000-4000-8000-00000000000${actor}","role":"authenticated"}',true);
          select public.complete_registration(
            '{"name":"Concorrência sintética","cpf":"52998224725","birth_date":"1990-01-01","city":"Recife","state_code":"PE","phone_is_whatsapp":true}',
            '{"kind":"member","name":"Ensaio"}', '30000000-0000-4000-8000-00000000000${index}');
          select pg_sleep(1); commit;`,
          )
          return promisify(execFile)(
            process.execPath,
            [
              cli,
              "db",
              "query",
              "--local",
              "--file",
              file,
              "--workdir",
              workdir,
            ],
            { timeout: 30_000 },
          )
        }),
      )
      assert.equal(
        results.filter((result) => result.status === "fulfilled").length,
        1,
      )
      const failure = results.find(
        (result) => result.status === "rejected",
      ).reason
      assert.match(
        String(failure.stdout) + String(failure.stderr),
        /Não foi possível concluir|Cadastro já concluído/,
      )
      run(
        "db",
        "query",
        "--local",
        `do $$ begin
        if (select count(*) from public.profiles) <> 1 or (select count(*) from private.account_details) <> 1 then
          raise exception 'Concorrência deixou contas/perfis parciais'; end if; end $$;
        delete from auth.users where id in ('20000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000002')`,
      )
    }
    run(
      "db",
      "query",
      "--local",
      "alter table public.phase0_pipeline_probe disable row level security",
    )
    assert.throws(
      check,
      (error) =>
        /Tabela pública sem RLS/.test(
          String(error.stderr) + String(error.stdout),
        ),
      "a verificação deve recusar especificamente a perda de RLS",
    )
    run(
      "db",
      "query",
      "--local",
      "alter table public.phase0_pipeline_probe enable row level security",
    )
    check()
    run("db", "query", "--local", "grant select on public.phase0_pipeline_probe to anon")
    assert.throws(check,
      error => /Ensaio expôs privilégios/.test(String(error.stderr) + String(error.stdout)),
      "a verificação deve detectar concessão de acesso não prevista no ensaio")
    run("db", "query", "--local", "revoke select on public.phase0_pipeline_probe from anon")
    check()
    const seed = readFileSync("supabase/seeds/identity.sql", "utf8")
    const seedFile = join(workdir, "seed-identity.sql")
    writeFileSync(seedFile, seed)
    assert.throws(() => run("db", "query", "--local", "--file", seedFile), error => /Seed exige destino sintético/.test(String(error.stdout) + String(error.stderr)))
    writeFileSync(
      seedFile,
      `set circuitone.seed_target='disposable';\n${seed}
      insert into public.profiles(id,owner_id,kind,name,city,state_code) values
        ('02000000-0000-4000-8000-000000000999','01000000-0000-4000-8000-000000000001','artist','Sentinela','Recife','PE');
      ${seed}`,
    )
    run("db", "query", "--local", "--file", seedFile)
    run("db", "query", "--local", "--file", resolve("tests/database/identity-seed-preserves-others.sql"))
    run(
      "db",
      "query",
      "--local",
      "--file",
      resolve("tests/database/identity-seed.sql"),
    )
    const taxonomy = JSON.parse(readFileSync("docs/specs/estilos-musicais.json", "utf8"))
    const expected = Object.entries(taxonomy).flatMap(([style, children]) => [[style, null], ...children.map(name => [style, name])])
    const taxonomyFile = join(workdir, "taxonomy.sql")
    writeFileSync(taxonomyFile, `do $$ begin
      if exists(with expected as (select value->>0 style,value->>1 substyle from jsonb_array_elements($taxonomy$${JSON.stringify(expected)}$taxonomy$::jsonb)),
        actual as (select name style,null::text substyle from public.music_styles union all select style,name from public.music_substyles)
        select from ((select * from expected except select * from actual) union all (select * from actual except select * from expected)) differences) then
        raise exception 'Taxonomia diverge da referência normativa'; end if; end $$;`)
    run("db", "query", "--local", "--file", taxonomyFile)
    run("db", "query", "--local", "drop table public.phase0_pipeline_probe")
    const generated = run(
      "gen",
      "types",
      "--local",
      "--schema",
      "public",
      "--output-format",
      "text",
      "--agent",
      "no",
    ).toString()
    assert.equal(
      generated.replaceAll("\r\n", "\n").trim(),
      readFileSync("src/types/database.generated.ts", "utf8")
        .replaceAll("\r\n", "\n")
        .trim(),
      "Tipos devem corresponder ao schema reconstruído",
    )
  },
)
