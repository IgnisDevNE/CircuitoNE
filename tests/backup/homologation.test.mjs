import assert from "node:assert/strict"
import { test } from "node:test"
import { spawn } from "node:child_process"
import { createRestoreDatabase } from "../../scripts/restore-drill.mjs"
import { homologationSql } from "../../scripts/apply-homologation.mjs"

test(
  "session lock prevents a second homologation and failed subprocess prevents seeding",
  { timeout: 90000 },
  async () => {
    const db = await createRestoreDatabase()
    let holder
    try {
      const script = homologationSql(
        "/tmp/reviewed-homologation",
        "a".repeat(64),
        "/missing-node",
      )
      holder = spawn(
        process.env.CONTAINER_ENGINE ?? "docker",
        [
          "exec",
          "-i",
          db.name,
          "psql",
          "-X",
          "-U",
          "supabase_admin",
          "-d",
          "postgres",
          "-Atq",
          "-v",
          "ON_ERROR_STOP=1",
        ],
        { stdio: ["pipe", "pipe", "pipe"] },
      )
      const exited = new Promise((resolve) => holder.once("exit", resolve))
      await new Promise((resolve, reject) => {
        holder.once("error", reject)
        holder.stdout.on("data", (bytes) => {
          if (bytes.toString().includes("LOCKED")) resolve()
        })
        holder.stdin.end(
          "select pg_advisory_lock(119,32);\n\\echo LOCKED\nselect pg_sleep(30);",
        )
      })
      assert.throws(
        () => db.sql(script),
        (error) =>
          error.message === "Homologation lock already held",
      )
      db.sql(
        "select pg_terminate_backend(pid) from pg_locks where locktype='advisory' and classid=119 and objid=32 and objsubid=2 and pid<>pg_backend_pid()",
      )
      await exited
      assert.throws(
        () => db.sql(script),
        (error) =>
          error.message === "Protected homologation child failed",
      )
      assert.equal(
        db
          .sql("select current_setting('circuitone.seed_target',true) is null")
          .trim(),
        "t",
      )
      assert.equal(db.sql("select pg_try_advisory_lock(119,32)").trim(), "t")
    } finally {
      holder?.kill()
      db.close()
    }
  },
)
