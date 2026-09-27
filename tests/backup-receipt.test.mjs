import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import test from "node:test"
import { verifyArchiveReceipt } from "../scripts/verify-backup.mjs"

test("checks the archive against a receipt from the exact successful main backup run before extraction", () => {
  const root = mkdtempSync(join(tmpdir(), "backup-receipt-"))
  const archive = join(root, "backup.tar.gz")
  const bytes = Buffer.from("synthetic archive, no personal data")
  const receipt = {
    version: 1,
    environment: "dev",
    projectRef: "odphoxozclrshqjgwbqk",
    bucket: "circuitone-backup-dev",
    sourceSha: "a".repeat(40),
    runId: 123,
    attempt: 1,
    key: "backups/20260927-123-1.tar.gz",
    size: bytes.length,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    exportStartedAt: "2026-09-27T00:01:00Z",
    createdAt: "2026-09-27T00:02:00Z",
  }
  const run = {
    id: 123,
    run_attempt: 1,
    name: "Daily database and Storage backup",
    path: ".github/workflows/backup.yml",
    event: "schedule",
    head_branch: "main",
    head_sha: receipt.sourceSha,
    status: "completed",
    conclusion: "success",
    created_at: "2026-09-27T00:00:00Z",
    updated_at: "2026-09-27T00:03:00Z",
    repository: { full_name: "IgnisDevNE/CircuitoNE" },
    head_repository: { full_name: "IgnisDevNE/CircuitoNE" },
    jobs: [
      {
        run_id: 123,
        head_sha: receipt.sourceSha,
        steps: [
          {
            name: "Export, upload and read back the new backup",
            conclusion: "success",
          },
        ],
      },
    ],
    receiptArtifact: {
      name: "backup-receipt-dev-123-1",
      expired: false,
      workflow_run: {
        id: 123,
        repository_id: 1380574734,
        head_repository_id: 1380574734,
        head_sha: receipt.sourceSha,
      },
    },
  }
  try {
    writeFileSync(archive, bytes)
    assert.equal(verifyArchiveReceipt(archive, receipt, run), receipt)
    for (const bad of [
      { ...run, head_branch: "codex/candidate" },
      { ...run, head_sha: "b".repeat(40) },
      { ...run, jobs: [] },
      { ...run, receiptArtifact: undefined },
      { ...run, id: 124 },
      { ...run, run_attempt: 2 },
      { ...run, event: "pull_request" },
      { ...run, path: ".github/workflows/ci.yml" },
      { ...run, repository: { full_name: "attacker/repo" } },
    ])
      assert.throws(
        () => verifyArchiveReceipt(archive, receipt, bad),
        /origin/i,
      )
    // A failed final rotation must not invalidate the only verified, receipted replacement.
    assert.equal(
      verifyArchiveReceipt(archive, receipt, { ...run, conclusion: "failure" }),
      receipt,
    )
    assert.throws(
      () =>
        verifyArchiveReceipt(archive, receipt, {
          ...run,
          conclusion: "failure",
          jobs: [
            {
              ...run.jobs[0],
              steps: [{ ...run.jobs[0].steps[0], conclusion: "failure" }],
            },
          ],
        }),
      /origin/i,
    )
    for (const bad of [
      { ...receipt, bucket: "circuitone-backup-prod" },
      { ...receipt, key: "backups/20260927-124-1.tar.gz" },
      { ...receipt, createdAt: "2026-09-27T00:00:00Z" },
      { ...receipt, size: 4_000_000_001 },
    ])
      assert.throws(() => verifyArchiveReceipt(archive, bad, run), /receipt/i)
    // Replacing the whole archive and its internal manifest cannot replace the external receipt.
    writeFileSync(archive, Buffer.from("other coherently rebuilt archive!!"))
    assert.throws(
      () => verifyArchiveReceipt(archive, receipt, run),
      /integrity/i,
    )
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
