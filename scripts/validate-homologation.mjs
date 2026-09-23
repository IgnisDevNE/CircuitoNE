import { resolve } from "node:path"
import { fileURLToPath } from "node:url"

export function validateHomologation({
  enabled,
  event,
  ref,
  sha,
  head,
  projectRef,
  url,
  plannedDigest,
  actualDigest,
}) {
  if (
    enabled !== "true" ||
    event !== "workflow_dispatch" ||
    ref !== "refs/heads/main" ||
    !/^[a-f0-9]{40}$/.test(sha || "") ||
    sha !== head ||
    projectRef !== "odphoxozclrshqjgwbqk" ||
    url !== "https://odphoxozclrshqjgwbqk.supabase.co" ||
    !/^[a-f0-9]{64}$/.test(plannedDigest || "") ||
    plannedDigest !== actualDigest
  ) {
    throw new Error(
      "Homologação recusada: origem, destino ou manifesto divergente",
    )
  }
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    validateHomologation({
      enabled: process.env.HOMOLOGATION_DB_WRITE_ENABLED,
      event: process.env.GITHUB_EVENT_NAME,
      ref: process.env.GITHUB_REF,
      sha: process.env.GITHUB_SHA,
      head: process.env.MAIN_HEAD,
      projectRef: process.env.SUPABASE_PROJECT_REF,
      url: process.env.SUPABASE_URL,
      plannedDigest: process.env.PLAN_DIGEST,
      actualDigest: process.env.ACTUAL_DIGEST,
    })
    console.log("Origem, destino e manifesto de homologação conferidos.")
  } catch {
    console.error(
      "::error::Homologação recusada: origem, destino ou manifesto divergente.",
    )
    process.exitCode = 1
  }
}
