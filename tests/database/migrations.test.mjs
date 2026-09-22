import { test } from "node:test"
import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { readFileSync, readdirSync, writeFileSync, rmSync, realpathSync } from "node:fs"
import { resolve, join, basename, dirname } from "node:path"
import { prepareLocalDatabase } from "../../scripts/prepare-local-db.mjs"

test(
  "reconstrói migrações duas vezes e detecta perda de RLS",
  { timeout: 480_000 },
  (t) => {
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
    assert.match(readFileSync(config, "utf8"), /^project_id = "circuitone-local"$/m)
    writeFileSync(
      config,
      readFileSync(config, "utf8").replace(
        'project_id = "circuitone-local"',
        `project_id = "circuitone-test-${basename(workdir).split("-").at(-1).toLowerCase()}"`,
      ),
    )
    const check = () =>
      run(
        "db",
        "query",
        "--local",
        "--file",
        resolve("tests/database/post-migration.sql"),
      )
    run("migration", "new", "pipeline_probe")
    const dir = join(workdir, "supabase/migrations")
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
  },
)
