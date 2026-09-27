export function validateDestination(name, ref, bucket) {
  const destinations = {
    dev: ["odphoxozclrshqjgwbqk", "circuitone-backup-dev"],
  }

  if (
    !Object.hasOwn(destinations, name) ||
    destinations[name][0] !== ref ||
    destinations[name][1] !== bucket
  ) {
    throw new Error("Backup destination mismatch")
  }

  return "aws-0-sa-east-1.pooler.supabase.com"
}

export function chooseRotation(previous, nextSize, cap) {
  if (
    !Array.isArray(previous) ||
    previous.length > 1 ||
    !Number.isSafeInteger(nextSize) ||
    nextSize < 1 ||
    !Number.isSafeInteger(cap) ||
    cap < 1
  ) {
    throw new Error("Invalid backup rotation input")
  }

  let used = 0

  for (const item of previous) {
    if (!/^backups\/[0-9]{8}-[0-9]+-[0-9]+\.tar\.gz$/.test(item.Key)) {
      throw new Error("Unexpected object under backup prefix")
    }

    if (!Number.isSafeInteger(item.Size) || item.Size < 0) {
      throw new Error("Invalid object size")
    }

    used += item.Size
  }

  if (used + nextSize > cap)
    throw new Error("Backup storage cap would be exceeded")

  return previous.map((item) => item.Key)
}

export function verifyStorageSnapshot(
  beforeRows,

  afterRows,

  before,

  after,

  local,
) {
  if (
    beforeRows !== afterRows ||
    JSON.stringify(before) !== JSON.stringify(after)
  ) {
    throw new Error("Storage changed during backup; retry after writes stop")
  }

  if (
    JSON.stringify(local) !==
    JSON.stringify(
      after.map((item) => ({
        key: item.key,

        size: item.size,
      })),
    )
  ) {
    throw new Error("Storage copy does not match the source listing")
  }
}

import { validateBackupReceipt } from "./verify-backup.mjs"

export function rotateVerifiedBackup(receipt, store) {
  validateBackupReceipt(receipt)

  const objects = store.list()

  if (
    !Array.isArray(objects) ||
    objects.some(
      (item) =>
        !Number.isSafeInteger(item.Size) ||
        item.Size < 0 ||
        (!item.Key?.startsWith("backups/") && !item.Key?.startsWith("probes/")),
    )
  ) {
    throw new Error("Unexpected remote backup inventory")
  }

  const candidate = objects.filter((item) => item.Key === receipt.key)

  if (candidate.length !== 1 || candidate[0].Size !== receipt.size)
    throw new Error("Receipted backup is missing or incomplete")

  const probes = objects
    .filter((item) => item.Key.startsWith("probes/"))
    .reduce((sum, item) => sum + item.Size, 0)

  const oldKeys = chooseRotation(
    objects.filter(
      (item) => item.Key.startsWith("backups/") && item.Key !== receipt.key,
    ),
    receipt.size,
    4_000_000_000 - probes,
  )

  const readback = store.readback(receipt.key)

  if (readback.size !== receipt.size || readback.sha256 !== receipt.sha256)
    throw new Error("Receipted backup readback mismatch")

  for (const key of oldKeys) store.remove(key)

  const remaining = store
    .list()
    .filter((item) => item.Key.startsWith("backups/"))

  if (
    remaining.length !== 1 ||
    remaining[0].Key !== receipt.key ||
    remaining[0].Size !== receipt.size
  ) {
    throw new Error("Remote backup rotation did not complete")
  }

  return oldKeys
}

export function discardUnpublishedBackup(receipt, artifacts, remove) {
  validateBackupReceipt(receipt)

  if (
    !Array.isArray(artifacts.artifacts) ||
    artifacts.total_count !== artifacts.artifacts.length ||
    artifacts.total_count >= 100
  )
    throw new Error("Cannot prove receipt publication state")

  if (
    artifacts.artifacts.some(
      (item) =>
        item.name === `backup-receipt-dev-${receipt.runId}-${receipt.attempt}`,
    )
  )
    return

  remove(receipt.key)
}
