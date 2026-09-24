import assert from "node:assert/strict"
import test from "node:test"
import {
  chooseRotation,
  verifyStorageSnapshot,
  validateDestination,
} from "../scripts/backup-rotation.mjs"

test("backup destination must match the environment exactly", () => {
  assert.equal(
    validateDestination("dev", "odphoxozclrshqjgwbqk", "circuitone-backup-dev"),
    "aws-0-sa-east-1.pooler.supabase.com",
  )
  assert.throws(() =>
    validateDestination(
      "production",
      "ukyoyrmebwadmuzkswdw",
      "circuitone-backup-prod",
    ),
  )
  assert.throws(() =>
    validateDestination(
      "dev",
      "odphoxozclrshqjgwbqk",
      "circuitone-backup-prod",
    ),
  )
})

test("backup rejects an object changed or missed while the database was dumped", () => {
  const before = [{ key: "photo.png", size: 3, etag: '"abc"', modified: "now" }]
  const local = [{ key: "photo.png", size: 3 }]
  assert.doesNotThrow(() =>
    verifyStorageSnapshot("db1", "db1", before, before, local),
  )
  assert.throws(() =>
    verifyStorageSnapshot("db1", "db2", before, before, local),
  )
  assert.throws(() =>
    verifyStorageSnapshot(
      "db1",
      "db1",
      before,
      [{ ...before[0], etag: '"def"' }],
      local,
    ),
  )
  assert.throws(() => verifyStorageSnapshot("db1", "db1", before, before, []))
})

test("rotation retains the last valid backup when the next upload exceeds the cap", () => {
  const previous = [
    { Key: "backups/20260923-123-1.tar.gz", Size: 2_000_000_000 },
  ]
  assert.throws(() => chooseRotation(previous, 2_000_000_001, 4_000_000_000))
  assert.deepEqual(chooseRotation(previous, 2_000_000_000, 4_000_000_000), [
    "backups/20260923-123-1.tar.gz",
  ])
  assert.throws(() =>
    chooseRotation([...previous, ...previous], 1, 4_000_000_000),
  )
  assert.deepEqual(chooseRotation([], 1, 4_000_000_000), [])
})

test("rotation rejects unexpected objects rather than deleting them", () => {
  assert.throws(() =>
    chooseRotation([{ Key: "backups/notes.txt", Size: 1 }], 1, 100),
  )
  assert.throws(() =>
    chooseRotation(
      [{ Key: "backups/20260923-123-1.tar.gz", Size: -1 }],
      1,
      100,
    ),
  )
})
