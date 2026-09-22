import { strict as assert } from 'node:assert'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { runInNewContext } from 'node:vm'

const workflow = () => readFileSync(new URL('../.github/workflows/canonical-dispatch.yml', import.meta.url), 'utf8')

test('canonical trigger runs only from the trusted base workflow and never checks out candidate code', () => {
  const yaml = workflow()
  assert.match(yaml, /workflow_run:/)
  assert.match(yaml, /workflows:\s*\[CI\]/)
  assert.match(yaml, /environment:\s*QA Dispatch/)
  assert.match(yaml, /secrets\.QA_DISPATCH_TOKEN/)
  assert.doesNotMatch(yaml, /pull_request_target:|actions\/checkout|\bpnpm\b|\bnpm\b|\bdocker\b/)
})

test('canonical trigger sends the exact QA request and handles GitHub responses', async () => {
  const script = workflow().match(/node --input-type=module <<'DISPATCH_QA'\r?\n([\s\S]*?)^\s+DISPATCH_QA/m)?.[1]
  assert.ok(script, 'inline dispatch script exists')
  const source = script.replace(/^          /gm, '')
  for (const status of [200, 204, 403]) {
    const calls = []
    const messages = []
    const request = runInNewContext(`(async () => { ${source} })()`, {
      process: { env: { QA_DISPATCH_TOKEN: 'test-token', SOURCE_RUN_ID: '123', SOURCE_EVENT: 'push' } },
      fetch: async (url, options) => {
        calls.push({ url, options })
        return { ok: status < 300, status }
      },
      AbortSignal,
      console: { log: (message) => messages.push(message) },
    })
    if (status === 403) await assert.rejects(request, /QA dispatch rejected \(HTTP 403\)/)
    else await request
    assert.equal(calls.length, 1)
    assert.equal(calls[0].url, 'https://api.github.com/repos/IgnisDevNE/CircuitoNE-QA/actions/workflows/canonical.yml/dispatches')
    assert.equal(calls[0].options.method, 'POST')
    assert.deepEqual(JSON.parse(calls[0].options.body), { ref: 'main', inputs: { source_run_id: '123', mode: 'promote' } })
    if (status !== 403) assert.match(messages[0], /requested for source run 123/)
  }
})
