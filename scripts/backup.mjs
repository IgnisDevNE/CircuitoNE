import { createHash } from "node:crypto"
import { execFileSync } from "node:child_process"
import {
  appendFileSync,
  chmodSync,
  closeSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs"
import { join, relative } from "node:path"
import {
  chooseRotation,
  validateDestination,
  verifyStorageSnapshot,
} from "./backup-rotation.mjs"

const r2Endpoint =
  "https://8ef7263b062ec08db392a2ef585cad86.r2.cloudflarestorage.com"
const pgImage =
  "docker.io/library/postgres@sha256:0b6698eaf9d5c65fd1b5ffe23cd27d2ad959feb1e3bc283a980c0c6d7ac66310"
const bucketCap = 4_000_000_000 // two isolated buckets keep simultaneous usage under 8 GB
let stage = "configuration"

function run(command, args, env = process.env) {
  try {
    return execFileSync(command, args, {
      env,
      stdio: ["ignore", "pipe", "pipe"],
      encoding: "utf8",
      timeout: 30 * 60_000,
      maxBuffer: 8 * 1024 * 1024,
    })
  } catch {
    throw new Error(`${command} operation failed; details omitted`)
  }
}

function sha256(path) {
  const hash = createHash("sha256")
  const descriptor = openSync(path, "r")
  const chunk = Buffer.allocUnsafe(1024 * 1024)
  try {
    let count
    while ((count = readSync(descriptor, chunk, 0, chunk.length, null)) > 0) {
      hash.update(chunk.subarray(0, count))
    }
  } finally {
    closeSync(descriptor)
  }
  return hash.digest("hex")
}

function filesUnder(root, dir = root) {
  const files = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isSymbolicLink() || (!entry.isDirectory() && !entry.isFile())) {
      throw new Error("Storage contains an unsupported filesystem entry")
    }
    if (entry.isDirectory()) files.push(...filesUnder(root, path))
    else
      files.push({
        path: relative(root, path).replaceAll("\\", "/"),
        size: statSync(path).size,
        sha256: sha256(path),
      })
  }
  return files
}

function s3(endpoint, region, env, args) {
  return run(
    "aws",
    ["s3api", ...args, "--endpoint-url", endpoint, "--region", region],
    env,
  )
}

function storageRowsFingerprint(pgEnv) {
  return run(
    "psql",
    [
      "-X",
      "-w",
      "-A",
      "-t",
      "-q",
      "-v",
      "ON_ERROR_STOP=1",
      "-c",
      "SELECT md5(coalesce(string_agg(row_to_json(o)::text, ';' ORDER BY o.id), '')) FROM storage.objects o;",
    ],
    pgEnv,
  ).trim()
}

function sourceSnapshot(endpoint, env, bucket) {
  const entries =
    JSON.parse(
      s3(endpoint, "sa-east-1", env, ["list-objects-v2", "--bucket", bucket]),
    ).Contents ?? []
  if (
    !Array.isArray(entries) ||
    entries.some(
      (item) =>
        typeof item.Key !== "string" ||
        !Number.isSafeInteger(item.Size) ||
        item.Size < 0 ||
        typeof item.ETag !== "string" ||
        typeof item.LastModified !== "string",
    )
  ) {
    throw new Error("Unexpected source object listing")
  }
  return entries
    .map((item) => ({
      key: item.Key,
      size: item.Size,
      etag: item.ETag,
      modified: item.LastModified,
    }))
    .sort((a, b) => a.key.localeCompare(b.key))
}

function main() {
  const {
    BACKUP_ENV: name,
    SUPABASE_PROJECT_REF: ref,
    R2_BUCKET: bucket,
    SUPABASE_DB_PASSWORD: password,
    SUPABASE_S3_ACCESS_KEY_ID: sourceId,
    SUPABASE_S3_SECRET_ACCESS_KEY: sourceSecret,
    R2_ACCESS_KEY_ID: r2Id,
    R2_SECRET_ACCESS_KEY: r2Secret,
    RUNNER_TEMP: runnerTemp,
    GITHUB_RUN_ID: runId,
    GITHUB_RUN_ATTEMPT: attempt,
    GITHUB_SHA: sourceSha,
  } = process.env
  const host = validateDestination(name, ref, bucket)
  if (
    ![password, sourceId, sourceSecret, r2Id, r2Secret, runnerTemp].every(
      Boolean,
    ) ||
    !/^\d+$/.test(runId ?? "") ||
    !/^\d+$/.test(attempt ?? "") ||
    !/^[a-f0-9]{40}$/.test(sourceSha ?? "")
  )
    throw new Error("Missing or invalid backup configuration")

  const work = mkdtempSync(join(runnerTemp, "circuitone-backup-"))
  const ca = join(runnerTemp, "supabase-ca.crt")
  const childBase = {
    PATH: process.env.PATH,
    HOME: process.env.HOME,
    LANG: process.env.LANG ?? "C.UTF-8",
  }
  const pgEnv = {
    ...childBase,
    PGHOST: host,
    PGPORT: "5432",
    PGDATABASE: "postgres",
    PGUSER: `postgres.${ref}`,
    PGPASSWORD: password,
    PGSSLMODE: "verify-full",
    PGSSLROOTCERT: ca,
    PGCONNECT_TIMEOUT: "10",
    PGOPTIONS: "-c statement_timeout=1800000",
    PGAPPNAME: "circuitone-daily-backup",
  }
  const sourceEndpoint = `https://${ref}.storage.supabase.co/storage/v1/s3`
  const awsBase = {
    ...childBase,
    AWS_EC2_METADATA_DISABLED: "true",
    AWS_PAGER: "",
  }
  const sourceEnv = {
    ...awsBase,
    AWS_ACCESS_KEY_ID: sourceId,
    AWS_SECRET_ACCESS_KEY: sourceSecret,
  }
  const r2Env = {
    ...awsBase,
    AWS_ACCESS_KEY_ID: r2Id,
    AWS_SECRET_ACCESS_KEY: r2Secret,
  }
  let uploadedKey
  let verified = false
  let archive
  let readback
  try {
    stage = "source snapshot"
    const buckets = JSON.parse(
      s3(sourceEndpoint, "sa-east-1", sourceEnv, ["list-buckets"]),
    ).Buckets?.map((item) => item.Name)
    if (
      !Array.isArray(buckets) ||
      buckets.some((value) => !/^[a-z0-9][a-z0-9._-]{1,62}$/.test(value))
    )
      throw new Error("Unexpected source bucket listing")
    const beforeRows = storageRowsFingerprint(pgEnv)
    const beforeObjects = new Map(
      buckets.map((sourceBucket) => [
        sourceBucket,
        sourceSnapshot(sourceEndpoint, sourceEnv, sourceBucket),
      ]),
    )

    stage = "database export"
    run(
      "docker",
      [
        "run",
        "--rm",
        "--read-only",
        "--cap-drop=ALL",
        "--security-opt=no-new-privileges",
        "--tmpfs",
        "/tmp:rw,nosuid,nodev,size=64m",
        "--user",
        `${process.getuid()}:${process.getgid()}`,
        "--mount",
        `type=bind,src=${work},dst=/out`,
        "--mount",
        `type=bind,src=${ca},dst=/ca.crt,readonly`,
        "-e",
        "PGHOST",
        "-e",
        "PGPORT",
        "-e",
        "PGDATABASE",
        "-e",
        "PGUSER",
        "-e",
        "PGPASSWORD",
        "-e",
        "PGSSLMODE",
        "-e",
        "PGCONNECT_TIMEOUT",
        "-e",
        "PGOPTIONS",
        "-e",
        "PGAPPNAME",
        "-e",
        "PGSSLROOTCERT=/ca.crt",
        pgImage,
        "pg_dump",
        "--format=custom",
        "--compress=6",
        "--file=/out/db.dump",
        "--lock-wait-timeout=10s",
      ],
      pgEnv,
    )
    const dump = join(work, "db.dump")
    if (statSync(dump).size < 100)
      throw new Error("Database dump is unexpectedly small")

    const storage = join(work, "storage")
    mkdirSync(storage)
    stage = "Storage copy"
    for (const sourceBucket of buckets) {
      const target = join(storage, sourceBucket)
      mkdirSync(target)
      run(
        "aws",
        [
          "s3",
          "sync",
          `s3://${sourceBucket}`,
          target,
          "--endpoint-url",
          sourceEndpoint,
          "--region",
          "sa-east-1",
          "--only-show-errors",
        ],
        sourceEnv,
      )
    }
    stage = "Storage consistency"
    const afterBuckets = JSON.parse(
      s3(sourceEndpoint, "sa-east-1", sourceEnv, ["list-buckets"]),
    ).Buckets?.map((item) => item.Name)
    if (
      JSON.stringify(afterBuckets?.sort()) !==
      JSON.stringify([...buckets].sort())
    ) {
      throw new Error("Storage bucket set changed during backup")
    }
    const afterRows = storageRowsFingerprint(pgEnv)
    if (beforeRows !== afterRows)
      throw new Error("Storage metadata changed during backup")
    for (const sourceBucket of buckets) {
      const before = beforeObjects.get(sourceBucket)
      const after = sourceSnapshot(sourceEndpoint, sourceEnv, sourceBucket)
      const local = filesUnder(storage, join(storage, sourceBucket))
        .map((item) => ({
          key: item.path.slice(sourceBucket.length + 1),
          size: item.size,
        }))
        .sort((a, b) => a.key.localeCompare(b.key))
      verifyStorageSnapshot(beforeRows, afterRows, before, after, local)
    }
    const manifest = {
      version: 1,
      environment: name,
      projectRef: ref,
      sourceSha,
      createdAt: new Date().toISOString(),
      buckets,
      database: { size: statSync(dump).size, sha256: sha256(dump) },
      objects: filesUnder(storage),
    }
    writeFileSync(
      join(work, "manifest.json"),
      `${JSON.stringify(manifest)}\n`,
      { mode: 0o600 },
    )
    archive = join(runnerTemp, `${name}-${runId}-${attempt}.tar.gz`)
    run("tar", [
      "-C",
      work,
      "-czf",
      archive,
      "db.dump",
      "manifest.json",
      "storage",
    ])
    chmodSync(archive, 0o600)
    const size = statSync(archive).size
    stage = "R2 capacity"
    const remoteObjects =
      JSON.parse(
        s3(r2Endpoint, "auto", r2Env, ["list-objects-v2", "--bucket", bucket]),
      ).Contents ?? []
    if (
      remoteObjects.some(
        (item) =>
          !item.Key?.startsWith("backups/") && !item.Key?.startsWith("probes/"),
      )
    )
      throw new Error("Unexpected object in backup bucket")
    const previous = remoteObjects.filter((item) =>
      item.Key.startsWith("backups/"),
    )
    const otherBytes = remoteObjects
      .filter((item) => item.Key.startsWith("probes/"))
      .reduce((total, item) => total + item.Size, 0)
    const oldKeys = chooseRotation(previous, size, bucketCap - otherBytes)
    const date = new Date().toISOString().slice(0, 10).replaceAll("-", "")
    const key = `backups/${date}-${runId}-${attempt}.tar.gz`
    if (oldKeys.includes(key)) throw new Error("Backup key already exists")
    uploadedKey = key
    stage = "R2 upload and readback"
    s3(r2Endpoint, "auto", r2Env, [
      "put-object",
      "--bucket",
      bucket,
      "--key",
      key,
      "--body",
      archive,
    ])
    readback = join(runnerTemp, `${name}-${runId}-${attempt}-readback.tar.gz`)
    s3(r2Endpoint, "auto", r2Env, [
      "get-object",
      "--bucket",
      bucket,
      "--key",
      key,
      readback,
    ])
    chmodSync(readback, 0o600)
    if (sha256(archive) !== sha256(readback))
      throw new Error("Backup readback checksum mismatch")
    run("gzip", ["-t", readback])
    verified = true
    stage = "R2 rotation"
    for (const oldKey of oldKeys) {
      s3(r2Endpoint, "auto", r2Env, [
        "delete-object",
        "--bucket",
        bucket,
        "--key",
        oldKey,
      ])
    }
    const remaining =
      JSON.parse(
        s3(r2Endpoint, "auto", r2Env, [
          "list-objects-v2",
          "--bucket",
          bucket,
          "--prefix",
          "backups/",
        ]),
      ).Contents ?? []
    if (
      remaining.length !== 1 ||
      remaining[0].Key !== key ||
      remaining[0].Size !== size
    ) {
      throw new Error("Remote backup state did not match the verified upload")
    }
    const summary = `Backup ${name}: source ${sourceSha}, ${buckets.length} buckets, ${manifest.objects.length} objects, ${size} bytes; readback verified; one copy retained.\n`
    console.log(summary.trim())
    if (process.env.GITHUB_STEP_SUMMARY)
      appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary)
  } finally {
    if (uploadedKey && !verified) {
      try {
        s3(r2Endpoint, "auto", r2Env, [
          "delete-object",
          "--bucket",
          bucket,
          "--key",
          uploadedKey,
        ])
      } catch {
        console.error("::error::Unverified upload could not be removed")
      }
    }
    rmSync(work, { recursive: true, force: true })
    if (archive) rmSync(archive, { force: true })
    if (readback) rmSync(readback, { force: true })
  }
}

try {
  main()
} catch {
  console.error(`::error::Backup failed during ${stage}; details omitted.`)
  process.exitCode = 1
}
