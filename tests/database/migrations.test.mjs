import { test } from "node:test"
import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
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
