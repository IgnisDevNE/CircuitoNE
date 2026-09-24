import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

test("backup credential probe runs only on reviewed main with isolated environments", () => {
  const workflow = readFileSync(
    new URL("../.github/workflows/backup-access.yml", import.meta.url),
    "utf8",
  )
  assert.match(workflow, /on:\s*\n\s*workflow_dispatch:/)
  assert.doesNotMatch(workflow, /pull_request|pull_request_target|schedule:/)
  assert.match(workflow, /github\.ref == 'refs\/heads\/main'/)
  assert.match(
    workflow,
    /git ls-remote https:\/\/github\.com\/IgnisDevNE\/CircuitoNE\.git refs\/heads\/main/,
  )
  assert.match(workflow, /\$GITHUB_SHA/)
  assert.doesNotMatch(workflow, /actions\/checkout/)
  assert.match(workflow, /environment: \$\{\{ matrix\.environment \}\}/)
  assert.match(
    workflow,
    /environment: Backup Dev[\s\S]*?ref: odphoxozclrshqjgwbqk[\s\S]*?bucket: circuitone-backup-dev/,
  )
  assert.match(
    workflow,
    /ref: odphoxozclrshqjgwbqk[\s\S]*?pooler_host: aws-0-sa-east-1\.pooler\.supabase\.com/,
  )
  assert.match(
    workflow,
    /environment: Backup Producao[\s\S]*?ref: ukyoyrmebwadmuzkswdw[\s\S]*?bucket: circuitone-backup-prod/,
  )
  assert.match(
    workflow,
    /ref: ukyoyrmebwadmuzkswdw[\s\S]*?pooler_host: aws-0-sa-east-1\.pooler\.supabase\.com/,
  )
  assert.match(workflow, /POOLER_HOST: \$\{\{ matrix\.pooler_host \}\}/)
  assert.match(workflow, /secrets\.SUPABASE_S3_ACCESS_KEY_ID/)
  assert.match(workflow, /secrets\.SUPABASE_S3_SECRET_ACCESS_KEY/)
  assert.match(workflow, /other_ref: ukyoyrmebwadmuzkswdw/)
  assert.match(workflow, /other_ref: odphoxozclrshqjgwbqk/)
  assert.match(workflow, /\$OTHER_PROJECT_REF\.storage\.supabase\.co/)
  assert.match(workflow, /secrets\.R2_ACCESS_KEY_ID/)
  assert.match(workflow, /secrets\.R2_SECRET_ACCESS_KEY/)
  assert.match(workflow, /secrets\.SUPABASE_DB_PASSWORD/)
  assert.match(workflow, /PGSSLMODE: 'verify-full'/)
  assert.match(workflow, /BEGIN READ ONLY;/)
  assert.match(workflow, /ON_ERROR_STOP=1/)
  assert.match(
    workflow,
    /700723581420dd1ac98fd7e9ac529f0ef210eadcaf87fc868a3ad7d114c2f3b7/,
  )
  assert.match(workflow, /head-bucket[\s\S]*?\$OTHER_BUCKET/)
  assert.match(
    workflow,
    /put-object[\s\S]*?get-object[\s\S]*?cmp[\s\S]*?delete-object/,
  )
  assert.match(workflow, /if: always\(\)/)
  assert.match(workflow, /GITHUB_RUN_ATTEMPT/)
  assert.doesNotMatch(workflow, /delete-object[^\n]*\|\| true/)
  assert.doesNotMatch(
    workflow,
    /SUPABASE_ACCESS_TOKEN|upload-artifact|db dump|pg_dump/,
  )
})
