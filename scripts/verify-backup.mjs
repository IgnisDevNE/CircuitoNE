import { createHash } from "node:crypto"
import {
  closeSync,
  lstatSync,
  openSync,
  readFileSync,
  readSync,
  readdirSync,
} from "node:fs"
import { join, relative } from "node:path"
import { fileURLToPath } from "node:url"

function digest(path) {
  const hash = createHash("sha256")
  const file = openSync(path, "r")
  const chunk = Buffer.allocUnsafe(1024 * 1024)
  try {
    let size
    while ((size = readSync(file, chunk, 0, chunk.length, null)) > 0)
      hash.update(chunk.subarray(0, size))
  } finally {
    closeSync(file)
  }
  return hash.digest("hex")
}

function files(root, dir = root) {
  const output = []
  for (const name of readdirSync(dir)) {
    const path = join(dir, name)
    const stat = lstatSync(path)
    if (stat.isDirectory()) output.push(...files(root, path))
    else if (stat.isFile())
      output.push({ path: relative(root, path).replaceAll("\\", "/"), stat })
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
  if (!lstatSync(join(root, "manifest.json")).isFile())
    throw new Error("Invalid backup manifest")
  const manifest = JSON.parse(readFileSync(join(root, "manifest.json"), "utf8"))
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

  const dump = join(root, "db.dump")
  const dbStat = lstatSync(dump)
  if (!dbStat.isFile()) throw new Error("Invalid database dump")
  const magic = Buffer.alloc(5)
  const handle = openSync(dump, "r")
  try {
    readSync(handle, magic, 0, 5, 0)
  } finally {
    closeSync(handle)
  }
  if (
    magic.toString() !== "PGDMP" ||
    dbStat.size !== manifest.database?.size ||
    digest(dump) !== manifest.database?.sha256
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
    if (
      file.path !== item.path ||
      file.stat.size !== item.size ||
      digest(join(storage, file.path)) !== item.sha256
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
