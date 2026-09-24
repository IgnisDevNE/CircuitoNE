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
