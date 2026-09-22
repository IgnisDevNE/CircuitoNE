import { strict as assert } from 'node:assert'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const workflow = () => readFileSync(new URL('../.github/workflows/canonical-dispatch.yml', import.meta.url), 'utf8')

test('canonical trigger runs only from the trusted base workflow and never checks out candidate code', () => {
  const yaml = workflow()
  assert.match(yaml, /workflow_run:/)
  assert.match(yaml, /workflows:\s*\[CI\]/)
  assert.match(yaml, /environment:\s*QA Dispatch/)
  assert.match(yaml, /secrets\.QA_DISPATCH_TOKEN/)
  assert.doesNotMatch(yaml, /pull_request_target:|actions\/checkout|\bpnpm\b|\bnpm\b|\bdocker\b/)
})
