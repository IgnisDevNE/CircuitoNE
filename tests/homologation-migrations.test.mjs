import assert from "node:assert/strict"

import { readFileSync } from "node:fs"

import test from "node:test"

import { validateHomologation } from "../scripts/validate-homologation.mjs"

const sha = "a".repeat(40)

const digest = "b".repeat(64)

const valid = {
  enabled: "true",

  event: "workflow_dispatch",

  ref: "refs/heads/main",

  sha,

  head: sha,

  projectRef: "odphoxozclrshqjgwbqk",

  url: "https://odphoxozclrshqjgwbqk.supabase.co",

  plannedDigest: digest,

  actualDigest: digest,
}

test("homologação aceita somente o SHA atual de main, manifesto íntegro e projeto dev", () => {
  assert.doesNotThrow(() => validateHomologation(valid))

  for (const invalid of [
    { enabled: "" },

    { event: "pull_request" },

    { ref: "refs/heads/codex/example" },

    { sha: "x".repeat(40) },

    { head: "c".repeat(40) },

    { projectRef: "ukyoyrmebwadmuzkswdw" },

    { url: "https://ukyoyrmebwadmuzkswdw.supabase.co" },

    { plannedDigest: "c".repeat(64) },

    { actualDigest: "c".repeat(64) },
  ]) {
    assert.throws(
      () => validateHomologation({ ...valid, ...invalid }),

      /Homologação recusada/,
    )
  }
})

test("workflow mantém segredo fora do ensaio e só escreve após o gate protegido", () => {
  const workflow = readFileSync(
    new URL("../.github/workflows/homologate.yml", import.meta.url),

    "utf8",
  )

  const [beforeApply, apply] = workflow.split("\n  apply:")

  assert.ok(apply, "job protegido ausente")

  assert.match(workflow, /on:\s*\n  workflow_dispatch:/)

  assert.doesNotMatch(
    workflow,

    /pull_request_target|\n  push:|\n  pull_request:/,
  )

  assert.match(beforeApply, /name: Reject disabled or non-main run/)

  assert.match(beforeApply, /\$ENABLED.*!= true/)

  assert.match(beforeApply, /pnpm test:database/)

  assert.doesNotMatch(beforeApply, /secrets\./)

  assert.match(apply, /needs: plan/)

  assert.match(apply, /environment: Homologação/)

  assert.match(apply, /cancel-in-progress: false/)

  assert.match(apply, /validate-homologation\.mjs/)

  assert.match(
    apply,

    /HOMOLOGATION_DB_WRITE_ENABLED: \$\{\{ vars\.HOMOLOGATION_DB_WRITE_ENABLED \}\}/,
  )

  assert.ok(
    apply.indexOf("validate-homologation.mjs") <
      apply.indexOf("secrets.SUPABASE_ACCESS_TOKEN"),
  )

  assert.match(beforeApply, /prepare-local-db\.mjs --homologation/)

  assert.match(beforeApply, /actions\/upload-artifact@[a-f0-9]{40}/)

  assert.match(
    beforeApply,
    /path: \$\{\{ steps\.manifest\.outputs\.workdir \}\}\/manifest\.json/,
  )

  assert.match(apply, /actions\/download-artifact@[a-f0-9]{40}/)

  assert.match(
    apply,
    /artifact-ids: \$\{\{ needs\.plan\.outputs\.manifest_artifact \}\}/,
  )

  assert.match(apply, /scripts\/apply-homologation\.mjs apply/)

  const driver = readFileSync(
    new URL("../scripts/apply-homologation.mjs", import.meta.url),
    "utf8",
  )
    .replaceAll('"', "'")
    .replace(/\s+/g, " ")

  assert.match(driver, /pg_try_advisory_lock\(119,32\)/)

  assert.match(driver, /SHELL_ERROR/)

  assert.match(driver, /'push', '--linked', '--dry-run', '--skip-vault'/)

  assert.match(driver, /'push', '--linked', '--skip-vault'/)

  assert.match(apply, /PGSSLMODE: verify-full/)

  assert.match(
    driver,
    /'psql', \['-X', '-w', '-A', '-t', '-q', '-v', 'ON_ERROR_STOP=1'\]/,
  )

  assert.doesNotMatch(apply, /supabase db query --linked/)

  assert.doesNotMatch(
    workflow,

    /db reset|--include-all|--include-seed|--db-url|SUPABASE_SERVICE_ROLE|secrets\.SUPABASE_DB_PASSWORD[\s\S]*?upload-artifact/,
  )
})
