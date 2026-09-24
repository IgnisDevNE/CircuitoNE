import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { test } from "node:test"
import { verifyBackupContents } from "../scripts/verify-backup.mjs"

const hash = (value) => createHash("sha256").update(value).digest("hex")

test("verifies the downloaded database and Storage objects, rejecting changes", () => {
  const root = mkdtempSync(join(tmpdir(), "backup-verify-"))
  try {
    mkdirSync(join(root, "storage", "photos"), { recursive: true })
    writeFileSync(join(root, "db.dump"), "PGDMPdatabase")
    writeFileSync(join(root, "storage", "photos", "image.jpg"), "synthetic")
    const manifest = {
      version: 1,
      environment: "dev",
      projectRef: "odphoxozclrshqjgwbqk",
      sourceSha: "a".repeat(40),
      createdAt: "2026-09-24T00:00:00.000Z",
      buckets: ["photos"],
      database: { size: 13, sha256: hash("PGDMPdatabase") },
      objects: [
        {
          path: "photos/image.jpg",
          size: 9,
          sha256: hash("synthetic"),
        },
      ],
    }
    writeFileSync(join(root, "manifest.json"), JSON.stringify(manifest))
    assert.deepEqual(verifyBackupContents(root), { buckets: 1, objects: 1 })
    writeFileSync(join(root, "storage", "photos", "image.jpg"), "corrupted")
    assert.throws(() => verifyBackupContents(root), /Storage/)
    writeFileSync(join(root, "storage", "photos", "image.jpg"), "synthetic")
    writeFileSync(join(root, "unexpected.txt"), "synthetic")
    assert.throws(() => verifyBackupContents(root), /inventory/)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
