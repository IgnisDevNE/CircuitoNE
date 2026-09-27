import assert from "node:assert/strict"
import { test, mock } from "node:test"
import {
  downloadBackupReceipt,
  githubBackupMetadata,
} from "../scripts/backup-receipt.mjs"

test("receipt lookup binds the attempt before treating a missing artifact as unpublished", async (t) => {
  const original = process.env.GITHUB_TOKEN
  process.env.GITHUB_TOKEN = "synthetic-metadata-token"
  t.after(() => {
    if (original === undefined) delete process.env.GITHUB_TOKEN
    else process.env.GITHUB_TOKEN = original
    mock.restoreAll()
  })
  const paths = []
  const run = {
    id: 123,
    run_attempt: 2,
    name: "Daily database and Storage backup",
    path: ".github/workflows/backup.yml",
    status: "completed",
    head_branch: "main",
    event: "workflow_dispatch",
    head_sha: "a".repeat(40),
    repository: { full_name: "IgnisDevNE/CircuitoNE" },
    head_repository: { full_name: "IgnisDevNE/CircuitoNE" },
  }
  let origin = run
  let artifacts = { total_count: 0, artifacts: [] }
  mock.method(globalThis, "fetch", async (url, options) => {
    assert.equal(options.redirect, "error")
    assert.equal(
      options.headers.Authorization,
      "Bearer synthetic-metadata-token",
    )
    paths.push(url)
    return Response.json(url.includes("/attempts/") ? origin : artifacts)
  })
  const key = "backups/20260927-123-2.tar.gz"
  assert.equal(await downloadBackupReceipt(key, "unused-directory"), null)
  assert.match(paths[0], /\/actions\/runs\/123\/attempts\/2$/)
  for (const bad of [
    { ...run, run_attempt: 1 },
    { ...run, head_branch: "candidate" },
    { ...run, event: "pull_request" },
  ]) {
    origin = bad
    await assert.rejects(
      downloadBackupReceipt(key, "unused-directory"),
      /origin/,
    )
  }
  origin = run
  artifacts = { total_count: 101, artifacts: [] }
  await assert.rejects(
    downloadBackupReceipt(key, "unused-directory"),
    /Incomplete/,
  )
  artifacts = {
    total_count: 1,
    artifacts: [{ name: "backup-receipt-dev-123-2", expired: true }],
  }
  await assert.rejects(
    downloadBackupReceipt(key, "unused-directory"),
    /unavailable/,
  )
  const calls = paths.length
  await assert.rejects(
    downloadBackupReceipt("../other", "unused-directory"),
    /Unrecognized/,
  )
  assert.equal(paths.length, calls)
  await assert.rejects(
    githubBackupMetadata("https://attacker.invalid/"),
    /metadata path/,
  )
  assert.equal(paths.length, calls)
})
