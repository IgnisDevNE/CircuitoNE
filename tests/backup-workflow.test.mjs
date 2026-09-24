import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

test("backup runs only from main in isolated environments and never publishes plaintext", () => {
  const yaml = readFileSync(
    new URL("../.github/workflows/backup.yml", import.meta.url),
    "utf8",
  )
  assert.match(yaml, /workflow_dispatch:/)
  assert.match(yaml, /schedule:/)
  assert.doesNotMatch(
    yaml,
    /pull_request:|pull_request_target:|upload-artifact/,
  )
  assert.match(yaml, /github\.ref == 'refs\/heads\/main'/)
  assert.match(yaml, /environment: \$\{\{ matrix\.environment \}\}/)
  assert.match(
    yaml,
    /Backup Dev[\s\S]*?odphoxozclrshqjgwbqk[\s\S]*?circuitone-backup-dev/,
  )
  assert.doesNotMatch(yaml, /Backup Producao|circuitone-backup-prod/)
  assert.match(
    yaml,
    /git ls-remote https:\/\/github\.com\/IgnisDevNE\/CircuitoNE\.git/,
  )
  assert.match(yaml, /supabase-ca\.crt[\s\S]*?sha256sum --check/)
  assert.match(yaml, /scripts\/backup\.mjs/)
  assert.match(yaml, /secrets\.SUPABASE_DB_PASSWORD/)
  assert.match(yaml, /secrets\.SUPABASE_S3_ACCESS_KEY_ID/)
  assert.match(yaml, /secrets\.R2_ACCESS_KEY_ID/)
})

test("ambiguous upload failures remove the unique candidate and preserve the previous backup", () => {
  const source = readFileSync(
    new URL("../scripts/backup.mjs", import.meta.url),
    "utf8",
  )
  assert.match(
    source,
    /if \(oldKeys\.includes\(key\)\)[\s\S]*?uploadedKey = key[\s\S]*?"put-object"/,
  )
  assert.match(source, /if \(uploadedKey && !verified\)[\s\S]*?"delete-object"/)
  assert.match(source, /verified = true[\s\S]*?for \(const oldKey of oldKeys\)/)
})
