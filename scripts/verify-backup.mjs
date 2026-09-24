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
    const result = verifyBackupContents(process.argv[2])
    console.log(
      `Backup contents verified: ${result.buckets} buckets, ${result.objects} objects.`,
    )
  } catch {
    console.error("::error::Downloaded backup failed integrity validation")
    process.exitCode = 1
  }
}
