import { createHash } from "node:crypto"

import {
  closeSync,
  constants,
  fstatSync,
  lstatSync,
  openSync,
  readFileSync,
  readSync,
  readdirSync,
} from "node:fs"

import { join, relative } from "node:path"

import { fileURLToPath } from "node:url"

function inspectFile(path, magic = false) {
  const hash = createHash("sha256")

  const file = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW)

  const chunk = Buffer.allocUnsafe(1024 * 1024)

  try {
    const stat = fstatSync(file)

    if (!stat.isFile()) throw new Error("Backup entry is not a regular file")

    const header = Buffer.alloc(5)

    if (magic) readSync(file, header, 0, header.length, 0)

    let size

    let offset = 0

    while ((size = readSync(file, chunk, 0, chunk.length, offset)) > 0) {
      hash.update(chunk.subarray(0, size))

      offset += size
    }

    return {
      size: stat.size,

      sha256: hash.digest("hex"),

      header: header.toString(),
    }
  } finally {
    closeSync(file)
  }
}

function files(root, dir = root) {
  const output = []

  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)

    if (entry.isDirectory()) output.push(...files(root, path))
    else if (entry.isFile())
      output.push({ path: relative(root, path).replaceAll("\\", "/") })
    else throw new Error("Storage contains an unsupported entry")
  }

  return output
}

export function validateBackupReceipt(receipt) {
  const fields = [
    "version",
    "environment",
    "projectRef",
    "bucket",
    "sourceSha",
    "runId",
    "attempt",
    "key",
    "size",
    "sha256",
    "exportStartedAt",
    "createdAt",
  ]

  if (
    !receipt ||
    typeof receipt !== "object" ||
    Object.keys(receipt).sort().join() !== fields.sort().join() ||
    receipt.version !== 1 ||
    receipt.environment !== "dev" ||
    receipt.projectRef !== "odphoxozclrshqjgwbqk" ||
    receipt.bucket !== "circuitone-backup-dev" ||
    !/^[a-f0-9]{40}$/.test(receipt.sourceSha ?? "") ||
    !/^[a-f0-9]{64}$/.test(receipt.sha256 ?? "") ||
    !Number.isSafeInteger(receipt.runId) ||
    receipt.runId < 1 ||
    !Number.isSafeInteger(receipt.attempt) ||
    receipt.attempt < 1 ||
    !Number.isSafeInteger(receipt.size) ||
    receipt.size < 1 ||
    receipt.size > 4_000_000_000 ||
    typeof receipt.createdAt !== "string" ||
    typeof receipt.exportStartedAt !== "string" ||
    !Number.isFinite(Date.parse(receipt.createdAt)) ||
    !Number.isFinite(Date.parse(receipt.exportStartedAt)) ||
    Date.parse(receipt.exportStartedAt) > Date.parse(receipt.createdAt) ||
    receipt.key !==
      `backups/${receipt.createdAt.slice(0, 10).replaceAll("-", "")}-${receipt.runId}-${receipt.attempt}.tar.gz`
  ) {
    throw new Error("Invalid backup receipt")
  }

  return receipt
}

export function verifyReceiptOrigin(receipt, run) {
  validateBackupReceipt(receipt)

  if (
    run?.id !== receipt.runId ||
    run.run_attempt !== receipt.attempt ||
    run.name !== "Daily database and Storage backup" ||
    run.path !== ".github/workflows/backup.yml" ||
    !["schedule", "workflow_dispatch"].includes(run.event) ||
    run.head_branch !== "main" ||
    run.head_sha !== receipt.sourceSha ||
    run.status !== "completed" ||
    run.repository?.full_name !== "IgnisDevNE/CircuitoNE" ||
    run.head_repository?.full_name !== "IgnisDevNE/CircuitoNE" ||
    !Number.isFinite(Date.parse(run.created_at)) ||
    !Number.isFinite(Date.parse(run.updated_at)) ||
    Date.parse(run.created_at) > Date.parse(receipt.exportStartedAt) ||
    Date.parse(run.updated_at) < Date.parse(receipt.createdAt) ||
    !run.jobs?.some(
      (job) =>
        job.run_id === run.id &&
        job.head_sha === run.head_sha &&
        job.steps?.some(
          (step) =>
            step.name === "Export, upload and read back the new backup" &&
            step.conclusion === "success",
        ),
    ) ||
    run.receiptArtifact?.name !==
      `backup-receipt-dev-${receipt.runId}-${receipt.attempt}` ||
    run.receiptArtifact.expired !== false ||
    run.receiptArtifact.workflow_run?.id !== run.id ||
    run.receiptArtifact.workflow_run.repository_id !== 1380574734 ||
    run.receiptArtifact.workflow_run.head_repository_id !== 1380574734 ||
    run.receiptArtifact.workflow_run.head_sha !== run.head_sha
  ) {
    throw new Error(
      "Backup receipt origin has no verified export and published protected receipt",
    )
  }

  return receipt
}

export function verifyArchiveReceipt(archive, receipt, run) {
  verifyReceiptOrigin(receipt, run)

  const inspected = inspectFile(archive)

  if (inspected.size !== receipt.size || inspected.sha256 !== receipt.sha256) {
    throw new Error("Archive failed external receipt integrity validation")
  }

  return receipt
}

export function verifyBackupContents(root) {
  if (!lstatSync(root).isDirectory())
    throw new Error("Invalid backup directory")

  if (
    JSON.stringify(readdirSync(root).sort()) !==
    JSON.stringify(["db.dump", "manifest.json", "storage"])
  )
    throw new Error("Backup root inventory differs from manifest")

  const manifestFile = openSync(
    join(root, "manifest.json"),

    constants.O_RDONLY | constants.O_NOFOLLOW,
  )

  let manifest

  try {
    if (!fstatSync(manifestFile).isFile())
      throw new Error("Invalid backup manifest")

    manifest = JSON.parse(readFileSync(manifestFile, "utf8"))
  } finally {
    closeSync(manifestFile)
  }

  if (
    manifest.version !== 1 ||
    manifest.environment !== "dev" ||
    manifest.projectRef !== "odphoxozclrshqjgwbqk" ||
    !/^[0-9a-f]{40}$/.test(manifest.sourceSha ?? "") ||
    !Number.isFinite(Date.parse(manifest.createdAt)) ||
    !Array.isArray(manifest.buckets) ||
    !Array.isArray(manifest.objects)
  )
    throw new Error("Backup manifest identifies an unexpected source")

  const database = inspectFile(join(root, "db.dump"), true)

  if (
    database.header !== "PGDMP" ||
    database.size !== manifest.database?.size ||
    database.sha256 !== manifest.database?.sha256
  )
    throw new Error("Database dump failed integrity validation")

  const storage = join(root, "storage")

  if (!lstatSync(storage).isDirectory())
    throw new Error("Invalid Storage directory")

  const buckets = readdirSync(storage).sort()

  if (
    buckets.some((name) => !lstatSync(join(storage, name)).isDirectory()) ||
    JSON.stringify(buckets) !== JSON.stringify([...manifest.buckets].sort())
  )
    throw new Error("Storage bucket inventory differs from manifest")

  const actual = files(storage).sort((a, b) => a.path.localeCompare(b.path))

  const expected = [...manifest.objects].sort((a, b) =>
    a.path.localeCompare(b.path),
  )

  if (actual.length !== expected.length)
    throw new Error("Storage object inventory differs from manifest")

  for (let index = 0; index < actual.length; index++) {
    const file = actual[index]

    const item = expected[index]

    const inspected = inspectFile(join(storage, file.path))

    if (
      file.path !== item.path ||
      inspected.size !== item.size ||
      inspected.sha256 !== item.sha256
    )
      throw new Error("Storage object failed integrity validation")
  }

  return { buckets: buckets.length, objects: actual.length }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv[2] === "--archive" && process.argv.length === 6) {
      verifyArchiveReceipt(
        process.argv[3],
        JSON.parse(readFileSync(process.argv[4], "utf8")),
        JSON.parse(readFileSync(process.argv[5], "utf8")),
      )

      console.log(
        "Archive verified against the independent backup execution receipt.",
      )
    } else {
      if (process.argv.length !== 3)
        throw new Error("Invalid backup verification arguments")

      const result = verifyBackupContents(process.argv[2])

      console.log(
        `Backup contents verified: ${result.buckets} buckets, ${result.objects} objects.`,
      )
    }
  } catch {
    console.error("::error::Downloaded backup failed integrity validation")

    process.exitCode = 1
  }
}
