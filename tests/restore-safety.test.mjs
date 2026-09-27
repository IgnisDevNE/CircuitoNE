import assert from "node:assert/strict"
import { test } from "node:test"
import childProcess from "node:child_process"
import { syncBuiltinESMExports } from "node:module"
import { readFileSync } from "node:fs"
import { createRestoreDatabase } from "../scripts/restore-drill.mjs"

test("native engine failure cannot disclose command credentials or captured output", async () => {
  const original = childProcess.execFileSync
  childProcess.execFileSync = () => {
    throw Object.assign(new Error("synthetic-sensitive-command"), {
      status: 125,
      stdout: "synthetic-sensitive-output",
      stderr: "synthetic-sensitive-error",
    })
  }
  syncBuiltinESMExports()
  try {
    await assert.rejects(createRestoreDatabase(), (error) => {
      assert.ok(!error.message.includes("synthetic-sensitive"))
      assert.equal(error.cause, undefined)
      assert.equal(error.stdout, undefined)
      assert.equal(error.stderr, undefined)
      return true
    })
  } finally {
    childProcess.execFileSync = original
    syncBuiltinESMExports()
  }
})

test("SQL guard failures retain only an approved fixed diagnostic", async () => {
  const original = childProcess.execFileSync
  let fail = false
  childProcess.execFileSync = (_engine, args) => {
    if (fail) {
      throw Object.assign(new Error("synthetic-sensitive-command"), {
        status: 1,
        stderr: "synthetic-sensitive-error\nERROR:  Homologation lock already held\nCONTEXT: synthetic-sensitive-context",
        stdout: "synthetic-sensitive-output",
      })
    }
    return args[0] === "logs"
      ? "PostgreSQL init process complete; ready for start up."
      : ""
  }
  syncBuiltinESMExports()
  let db
  try {
    db = await createRestoreDatabase()
    fail = true
    assert.throws(() => db.sql("select 1"), (error) => {
      assert.equal(error.message, "Homologation lock already held")
      assert.equal(error.cause, undefined)
      assert.equal(error.stdout, undefined)
      assert.equal(error.stderr, undefined)
      return true
    })
    assert.throws(() => db.run(["logs", db.name]), {
      message: `Disposable ${process.env.CONTAINER_ENGINE ?? "docker"} logs failed (exit 1)`,
    })
  } finally {
    db?.close()
    childProcess.execFileSync = original
    syncBuiltinESMExports()
  }
})

test("CI prepares pinned recovery images before parallel native tests", () => {
  const workflow = readFileSync(".github/workflows/ci.yml", "utf8")
  const restore = readFileSync("scripts/restore-drill.mjs", "utf8")
  for (const image of [
    "docker.io/supabase/postgres@sha256:6942962433a569e87f228b4d4ab7e11db5deca64e43babb3a038443ad6c4f1bb",
    "docker.io/supabase/gotrue@sha256:c0c25187a6b835e65a6f6e6c6b39d090e832d40e6de5186f2c038e0411944232",
  ]) {
    assert.ok(workflow.includes(image), "CI must use the verified official mirror")
    assert.ok(restore.includes(image), "Runtime must use the same pinned mirror")
  }
  const job = workflow.slice(workflow.indexOf("  backup_recovery:"))
  assert.ok(job.indexOf("Prepare pinned recovery images") >= 0)
  assert.ok(
    job.indexOf("Prepare pinned recovery images") <
      job.indexOf("node --test tests/backup/"),
  )
})
