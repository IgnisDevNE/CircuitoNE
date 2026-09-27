import assert from "node:assert/strict"

import test from "node:test"

import {
  chooseRotation,
  verifyStorageSnapshot,
  validateDestination,
  rotateVerifiedBackup,
  discardUnpublishedBackup,
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

test("rotation never deletes the valid predecessor before the receipted replacement passes readback", () => {
  const receipt = {
    version: 1,
    environment: "dev",
    projectRef: "odphoxozclrshqjgwbqk",
    bucket: "circuitone-backup-dev",

    sourceSha: "a".repeat(40),
    runId: 123,
    attempt: 1,
    key: "backups/20260927-123-1.tar.gz",

    size: 10,
    sha256: "b".repeat(64),
    exportStartedAt: "2026-09-27T00:00:00Z",
    createdAt: "2026-09-27T00:01:00Z",
  }

  const old = { Key: "backups/20260926-122-1.tar.gz", Size: 10 }

  for (const failure of ["download", "checksum", "delete", "listing", "none"]) {
    let objects = [old, { Key: receipt.key, Size: receipt.size }]

    const store = {
      list: () =>
        failure === "listing"
          ? [...objects, { Key: "unknown.txt", Size: 1 }]
          : objects,

      readback: () => {
        if (failure === "download")
          throw new Error("synthetic unavailable download")

        return {
          size: receipt.size,
          sha256: failure === "checksum" ? "c".repeat(64) : receipt.sha256,
        }
      },

      remove: (key) => {
        if (failure === "delete") throw new Error("synthetic rejected deletion")

        objects = objects.filter((item) => item.Key !== key)
      },
    }

    if (failure !== "none") {
      assert.throws(() => rotateVerifiedBackup(receipt, store))

      assert.ok(objects.some((item) => item.Key === old.Key))
    } else {
      rotateVerifiedBackup(receipt, store)

      assert.deepEqual(objects, [{ Key: receipt.key, Size: receipt.size }])
    }
  }

  const removed = []

  assert.throws(() =>
    discardUnpublishedBackup(
      receipt,
      { total_count: 101, artifacts: [] },
      (key) => removed.push(key),
    ),
  )

  assert.equal(removed.length, 0)

  discardUnpublishedBackup(
    receipt,
    { total_count: 1, artifacts: [{ name: "backup-receipt-dev-123-1" }] },
    (key) => removed.push(key),
  )

  assert.equal(removed.length, 0)

  discardUnpublishedBackup(receipt, { total_count: 0, artifacts: [] }, (key) =>
    removed.push(key),
  )

  assert.deepEqual(removed, [receipt.key])
})
