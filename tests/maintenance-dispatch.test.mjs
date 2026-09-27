import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"
import { runInNewContext } from "node:vm"

const yaml = () =>
  readFileSync(
    new URL("../.github/workflows/maintenance-dispatch.yml", import.meta.url),
    "utf8",
  )
const defaults = {
  GITHUB_REPOSITORY: "IgnisDevNE/CircuitoNE",
  GITHUB_EVENT_NAME: "workflow_dispatch",
  GITHUB_REF: "refs/heads/main",
  GITHUB_SHA: "a".repeat(40),
  REQUEST_ACTOR: "magalz",
  TRIGGERING_ACTOR: "magalz",
  TARGET_WORKFLOW: "homologate.yml",
  GITHUB_TOKEN: "synthetic-token",
}
async function execute(
  overrides = {},
  head = defaults.GITHUB_SHA,
  status = 204,
) {
  const source = yaml().match(
    /node --input-type=module <<'MAINTENANCE'\r?\n([\s\S]*?)^\s+MAINTENANCE/m,
  )?.[1]
  assert.ok(source)
  const calls = [],
    logs = []
  const result = runInNewContext(
    `(async () => {${source.replace(/^          /gm, "")}})()`,
    {
      process: { env: { ...defaults, ...overrides } },
      AbortSignal,
      console: { log: (value) => logs.push(value) },
      fetch: async (url, options) => {
        calls.push({ url, options })
        return options.method === "POST"
          ? { ok: status < 300, status }
          : {
              ok: true,
              status: 200,
              json: async () => ({ object: { sha: head } }),
            }
      },
    },
  )
  return { result, calls, logs }
}
test("maintenance dispatch is trusted main-only and cannot execute candidate code or read secrets", () => {
  const text = yaml()
  assert.match(text, /permissions: \{\}/)
  assert.match(text, /actions: write/)
  assert.doesNotMatch(
    text,
    /actions\/checkout|secrets\.|environment:|pull_request|repository_dispatch|schedule:|\b(?:pnpm|npm|docker|podman)\b/,
  )
})
test("only maintainer requests on current main can dispatch the four fixed operations", async () => {
  for (const target of [
    "homologate.yml",
    "backup.yml",
    "restore-drill.yml",
    "validate-production.yml",
  ]) {
    const run = await execute({ TARGET_WORKFLOW: target })
    await run.result
    assert.equal(run.calls.length, 2)
    assert.equal(
      run.calls[1].url,
      `https://api.github.com/repos/IgnisDevNE/CircuitoNE/actions/workflows/${target}/dispatches`,
    )
    assert.deepEqual(JSON.parse(run.calls[1].options.body), { ref: "main" })
    assert.equal(run.calls[1].options.redirect, "error")
    assert.ok(run.calls[1].options.signal)
    assert.ok(!run.logs.join(" ").includes(defaults.GITHUB_TOKEN))
  }
  for (const overrides of [
    { REQUEST_ACTOR: "ignisdevne[bot]" },
    { TRIGGERING_ACTOR: "other" },
    { GITHUB_REF: "refs/heads/candidate" },
    { GITHUB_EVENT_NAME: "push" },
    { GITHUB_REPOSITORY: "other/repo" },
    { TARGET_WORKFLOW: "ci.yml" },
    { TARGET_WORKFLOW: "../../anything" },
  ]) {
    const run = await execute(overrides)
    await assert.rejects(run.result, /Unauthorized maintenance request/)
    assert.equal(run.calls.length, 0)
  }
  const stale = await execute({}, "b".repeat(40))
  await assert.rejects(stale.result, /Maintenance main advanced/)
  assert.equal(stale.calls.length, 1)
  const denied = await execute({}, defaults.GITHUB_SHA, 403)
  await assert.rejects(
    denied.result,
    /Maintenance dispatch rejected \(HTTP 403\)/,
  )
})
