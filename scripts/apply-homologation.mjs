import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { execFileSync, spawn } from "node:child_process"
import { lstatSync, readFileSync, readdirSync } from "node:fs"
import { join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { homologationInputs } from "./prepare-local-db.mjs"

const hash = (bytes) => createHash("sha256").update(bytes).digest("hex")

// POSIX process group: loss of the holder also stops CLI descendants before another run.
export async function runProtectedProcess(
  command,
  args,
  input,
  timeout = 1200000,
) {
  assert.equal(process.platform, "linux")
  const child = spawn(command, args, {
    detached: true,
    stdio: ["pipe", "ignore", "ignore"],
  })
  const stop = () => {
    if (child.pid) {
      try {
        process.kill(-child.pid, "SIGKILL")
      } catch (error) {
        if (error.code !== "ESRCH") throw error
      }
    }
  }
  await new Promise((resolve, reject) => {
    const abort = () => {
      stop()
      reject(new Error("Protected process interrupted"))
    }
    const timer = setTimeout(abort, timeout)
    process.once("SIGTERM", abort)
    process.once("SIGINT", abort)
    const cleanup = () => {
      clearTimeout(timer)
      process.removeListener("SIGTERM", abort)
      process.removeListener("SIGINT", abort)
      stop()
    }
    child.once("error", (error) => {
      cleanup()
      reject(error)
    })
    child.once("exit", (code) => {
      cleanup()
      if (code === 0) resolve()
      else reject(new Error("Protected process failed"))
    })
    child.stdin.on("error", () => {})
    child.stdin.end(input)
  })
}
export function verifyHomologationFiles(root, digest, sha) {
  assert.match(digest, /^[a-f0-9]{64}$/)
  assert.match(sha, /^[a-f0-9]{40}$/)
  const read = (path) => {
    for (let index = 0; index <= path.split("/").length; index++) {
      const item = join(root, ...path.split("/").slice(0, index))
      assert.ok(
        !lstatSync(item).isSymbolicLink(),
        "Manifest path cannot be a link",
      )
    }
    return readFileSync(join(root, path))
  }
  const bytes = read("manifest.json")
  assert.equal(hash(bytes), digest, "Manifest bytes changed")
  const manifest = JSON.parse(bytes)
  assert.equal(manifest.sourceSha, sha)
  assert.equal(manifest.projectRef, "odphoxozclrshqjgwbqk")
  assert.equal(manifest.seedReference, "2026-09-26T12:00:00.000Z")
  assert.deepEqual(
    manifest.inputs.map((input) => input.file),
    homologationInputs,
  )
  assert.equal(
    hash(read("supabase/config.toml")),
    manifest.configSha256,
    "Configuration bytes changed",
  )
  assert.deepEqual(
    readdirSync(join(root, "supabase/migrations")).sort(),
    manifest.migrations.map((input) => input.file).sort(),
  )
  for (const input of manifest.migrations) {
    assert.match(input.file, /^[0-9]{14}_[a-z][a-z0-9_]*\.sql$/)
    assert.equal(
      hash(read("supabase/migrations/" + input.file)),
      input.sha256,
      "Migration bytes changed",
    )
  }
  for (const input of manifest.inputs)
    assert.equal(
      hash(read(input.file)),
      input.sha256,
      "Seed/smoke bytes changed",
    )
  return manifest
}

export function homologationSql(root, digest, node = process.execPath) {
  // Linux CI paths only: no shell interpolation of arguments or psql metacommands.
  for (const path of [root, node]) assert.match(path, /^\/[a-zA-Z0-9_./-]+$/)
  assert.match(digest, /^[a-f0-9]{64}$/)
  const command = (mode) =>
    `\\! ${node} scripts/apply-homologation.mjs ${mode} ${root} ${digest}\n\\if :SHELL_ERROR\ndo $$ begin raise exception 'Protected homologation child failed'; end $$;\n\\endif\n`
  return `\\set ON_ERROR_STOP on
select pg_try_advisory_lock(119,32) as locked \\gset
\\if :locked
\\else
do $$ begin raise exception 'Homologation lock already held'; end $$;
\\endif
${command("migrate")}
set circuitone.seed_target='odphoxozclrshqjgwbqk';
set circuitone.seed_time='2026-09-26T12:00:00.000Z';
${homologationInputs.map((path) => `\\i ${root}/${path}`).join("\n")}
${command("rest")}
select pg_advisory_unlock(119,32);
`
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    assert.equal(process.argv.length, 5)
    const [mode, root, digest] = process.argv.slice(2)
    verifyHomologationFiles(root, digest, process.env.GITHUB_SHA)
    const env = process.env
    assert.equal(env.SUPABASE_PROJECT_REF, "odphoxozclrshqjgwbqk")
    assert.equal(env.SUPABASE_URL, "https://odphoxozclrshqjgwbqk.supabase.co")
    assert.match(
      env.PGHOST ?? "",
      /^aws-[0-9]+-sa-east-1\.pooler\.supabase\.com$/,
    )
    assert.equal(env.PGPORT, "5432")
    assert.equal(env.PGUSER, "postgres.odphoxozclrshqjgwbqk")
    assert.equal(env.PGDATABASE, "postgres")
    assert.equal(env.PGSSLMODE, "verify-full")
    assert.ok(env.PGSSLROOTCERT && env.PGPASSWORD && env.SUPABASE_ACCESS_TOKEN)
    const run = (command, args, input) =>
      execFileSync(command, args, {
        input,
        stdio: ["pipe", "pipe", "pipe"],
        timeout: 900000,
        maxBuffer: 1024 * 1024,
      })
    if (mode === "apply") {
      const { checkHomologationAuthority } = await import(
        "./homologation-rest.mjs"
      )
      await checkHomologationAuthority()
      await runProtectedProcess(
        "psql",
        ["-X", "-w", "-A", "-t", "-q", "-v", "ON_ERROR_STOP=1"],
        homologationSql(root, digest),
      )
    } else if (mode === "migrate") {
      const head = run("git", [
        "ls-remote",
        "https://github.com/IgnisDevNE/CircuitoNE.git",
        "refs/heads/main",
      ])
        .toString()
        .split(/\s/)[0]
      assert.equal(head, env.GITHUB_SHA, "Main advanced before database write")
      const cli = resolve("node_modules/supabase/dist/supabase.js")
      const options = ["--workdir", root, "--yes"]
      run(process.execPath, [
        cli,
        "link",
        "--project-ref",
        "odphoxozclrshqjgwbqk",
        ...options,
      ])
      verifyHomologationFiles(root, digest, env.GITHUB_SHA)
      run(process.execPath, [
        cli,
        "db",
        "push",
        "--linked",
        "--dry-run",
        "--skip-vault",
        ...options,
      ])
      run(process.execPath, [
        cli,
        "db",
        "push",
        "--linked",
        "--skip-vault",
        ...options,
      ])
    } else if (mode === "rest") {
      const { checkHomologationRest } = await import("./homologation-rest.mjs")
      const { checkHomologationSsr } = await import("./homologation-ssr.mjs")
      await checkHomologationRest(env, undefined, checkHomologationSsr)
    } else throw new Error("Unknown homologation operation")
    console.log(
      "Protected homologation operation succeeded; no production changed.",
    )
  } catch {
    console.error(
      "::error::Homologation failed; no promotion. Inspect reviewed migration state before retrying.",
    )
    process.exitCode = 1
  }
}
