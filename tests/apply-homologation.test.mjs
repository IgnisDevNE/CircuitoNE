import assert from "node:assert/strict"
import { test } from "node:test"
import { createHash } from "node:crypto"
import { readFileSync, writeFileSync, rmSync } from "node:fs"
import { join } from "node:path"
import { prepareHomologation } from "../scripts/prepare-local-db.mjs"
import {
  verifyHomologationFiles,
  homologationSql,
} from "../scripts/apply-homologation.mjs"

test("approved homologation manifest binds source, config, migrations and all seed/smoke bytes", () => {
  const sha = "a".repeat(40)
  const root = prepareHomologation(process.cwd(), sha)
  try {
    const digest = createHash("sha256")
      .update(readFileSync(join(root, "manifest.json")))
      .digest("hex")
    assert.doesNotThrow(() => verifyHomologationFiles(root, digest, sha))
    assert.throws(() => verifyHomologationFiles(root, digest, "b".repeat(40)))
    assert.throws(() => verifyHomologationFiles(root, "c".repeat(64), sha))
    writeFileSync(join(root, "supabase/seeds/messages.sql"), "changed seed")
    assert.throws(() => verifyHomologationFiles(root, digest, sha), /bytes/)
    for (const bad of [
      "/tmp/a;touch /tmp/pwn",
      "/tmp/a\n",
      "relative",
      "/tmp/a$HOME",
    ]) {
      assert.throws(() => homologationSql(bad, digest, "/usr/bin/node"))
    }
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
