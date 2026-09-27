import { execFileSync } from "node:child_process"
import {
  constants,
  openSync,
  closeSync,
  fstatSync,
  readSync,
  mkdirSync,
  readdirSync,
} from "node:fs"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { verifyReceiptOrigin } from "./verify-backup.mjs"

const repo = "IgnisDevNE/CircuitoNE"
export function readReceiptFile(file) {
  const fd = openSync(
    file,
    constants.O_RDONLY |
      (constants.O_NOFOLLOW ?? 0) |
      (constants.O_NONBLOCK ?? 0),
  )
  try {
    const stat = fstatSync(fd)
    if (!stat.isFile() || stat.size > 4096)
      throw new Error("Receipt file is invalid")
    const bytes = Buffer.alloc(4097)
    let size = 0
    while (size < bytes.length) {
      const n = readSync(fd, bytes, size, bytes.length - size, null)
      if (!n) break
      size += n
    }
    if (size > 4096) throw new Error("Receipt file is oversized")
    return JSON.parse(bytes.subarray(0, size).toString("utf8"))
  } finally {
    closeSync(fd)
  }
}
export async function githubBackupMetadata(path) {
  if (
    !/^actions\/runs\/[1-9][0-9]*(?:\/attempts\/[1-9][0-9]*(?:\/jobs\?per_page=100)?|\/artifacts\?per_page=100)$/.test(
      path,
    )
  )
    throw new Error("Invalid backup metadata path")
  if (!process.env.GITHUB_TOKEN)
    throw new Error("Missing receipt metadata authority")
  const response = await fetch(`https://api.github.com/repos/${repo}/${path}`, {
    headers: {
      Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2026-03-10",
    },
    redirect: "error",
    signal: AbortSignal.timeout(15000),
  })
  if (!response.ok) throw new Error("Backup metadata lookup rejected")
  const chunks = []
  let size = 0
  for await (const chunk of response.body) {
    size += chunk.byteLength
    if (size > 1024 * 1024)
      throw new Error("Backup metadata response too large")
    chunks.push(chunk)
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"))
}

export async function downloadBackupReceipt(key, directory) {
  const match = /^backups\/[0-9]{8}-([1-9][0-9]*)-([1-9][0-9]*)\.tar\.gz$/.exec(
    key,
  )
  if (!match) throw new Error("Unrecognized receipted backup key")
  const [, runId, attempt] = match
  const run = await githubBackupMetadata(
    `actions/runs/${runId}/attempts/${attempt}`,
  )
  if (
    run.id !== Number(runId) ||
    run.run_attempt !== Number(attempt) ||
    run.name !== "Daily database and Storage backup" ||
    run.path !== ".github/workflows/backup.yml" ||
    run.status !== "completed" ||
    run.head_branch !== "main" ||
    !["schedule", "workflow_dispatch"].includes(run.event) ||
    !/^[a-f0-9]{40}$/.test(run.head_sha ?? "") ||
    run.repository?.full_name !== repo ||
    run.head_repository?.full_name !== repo
  )
    throw new Error("Untrusted backup origin")
  const artifacts = await githubBackupMetadata(
    `actions/runs/${runId}/artifacts?per_page=100`,
  )
  if (
    !Array.isArray(artifacts.artifacts) ||
    artifacts.total_count !== artifacts.artifacts.length ||
    artifacts.total_count >= 100
  )
    throw new Error("Incomplete receipt artifact listing")
  const name = `backup-receipt-dev-${runId}-${attempt}`
  const matches = artifacts.artifacts.filter((item) => item.name === name)
  if (matches.length === 0) return null
  if (matches.length !== 1 || matches[0].expired)
    throw new Error("Backup receipt unavailable or ambiguous")
  const jobs = await githubBackupMetadata(
    `actions/runs/${runId}/attempts/${attempt}/jobs?per_page=100`,
  )
  if (
    !Array.isArray(jobs.jobs) ||
    jobs.total_count !== jobs.jobs.length ||
    jobs.total_count >= 100
  )
    throw new Error("Incomplete backup job evidence")
  run.jobs = jobs.jobs
  run.receiptArtifact = matches[0]
  mkdirSync(directory, { recursive: true, mode: 0o700 })
  execFileSync(
    "gh",
    [
      "run",
      "download",
      runId,
      "--name",
      name,
      "--repo",
      repo,
      "--dir",
      directory,
    ],
    {
      env: {
        PATH: process.env.PATH,
        HOME: process.env.HOME,
        GH_TOKEN: process.env.GITHUB_TOKEN,
      },
      stdio: "pipe",
      timeout: 60000,
    },
  )
  const file = join(directory, "backup-receipt.json")
  if (readdirSync(directory).join() !== "backup-receipt.json")
    throw new Error("Receipt artifact inventory is invalid")
  const receipt = readReceiptFile(file)
  verifyReceiptOrigin(receipt, run)
  if (receipt.key !== key)
    throw new Error("Receipt key differs from requested backup")
  return { receipt, run }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.length !== 4)
      throw new Error("Invalid receipt lookup arguments")
    const record = await downloadBackupReceipt(process.argv[2], process.argv[3])
    if (!record) throw new Error("No independent receipt for this backup")
    // Metadata only, consumed by the isolated restore. Never prints credentials or backup contents.
    process.stdout.write(JSON.stringify(record) + "\n")
  } catch {
    console.error("Independent backup receipt could not be verified.")
    process.exitCode = 1
  }
}
