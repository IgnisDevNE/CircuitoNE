import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { test } from 'node:test'

const engine = process.env.CONTAINER_ENGINE || 'podman'
const image = 'localhost/circuitone-agent:bootstrap'
const blocked = ['plugins', 'apps', 'browser_use', 'browser_use_external', 'browser_use_full_cdp_access', 'in_app_browser', 'computer_use', 'remote_plugin']
function run(args) {
  const result = spawnSync(engine, ['run', '--rm', '--network', 'none', '--read-only', '--tmpfs', '/tmp', '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges', image, ...args], { encoding: 'utf8', timeout: 30_000 })
  assert.ifError(result.error)
  return result
}

test('official Codex disables integrations even without launcher or with CLI overrides', () => {
  for (const overrides of [[], blocked.flatMap(name => ['--enable', name]), blocked.flatMap(name => ['-c', `features.${name}=true`])]) {
    const result = run(['codex', ...overrides, 'features', 'list'])
    assert.equal(result.status, 0, result.stderr)
    for (const feature of blocked) assert.match(result.stdout, new RegExp(`^${feature}\\s+\\S+\\s+false$`, 'm'))
  }
})

test('a different config directory cannot enable MCP or plugins', () => {
  const result = run(['env', 'CODEX_HOME=/tmp', 'codex', '-c', 'mcp_servers.canary.command="sh"', '-c', 'mcp_servers.canary.args=["-c","touch /tmp/mcp-canary"]', 'mcp', 'list', '--json'])
  assert.equal(result.status, 0, result.stderr)
  const [server] = JSON.parse(result.stdout)
  assert.equal(server.enabled, false)
  assert.match(server.disabled_reason, /requirements/)
  const features = run(['env', 'CODEX_HOME=/tmp', 'codex', '--enable', 'plugins', '--enable', 'apps', 'features', 'list'])
  assert.equal(features.status, 0, features.stderr)
  assert.match(features.stdout, /^apps\s+stable\s+false$/m)
  assert.match(features.stdout, /^plugins\s+stable\s+false$/m)
})

test('agent cannot modify the system policy or execute as root', () => {
  assert.equal(run(['circuitone-agent', '--version']).status, 0)
  assert.equal(run(['id', '-u']).stdout.trim(), '1000')
  assert.notEqual(run(['sh', '-c', 'printf changed > /etc/codex/requirements.toml']).status, 0)
})

test('Memtrace CLI is installed without host credentials or automatic setup', () => {
  const result = run(['memtrace', '--version'])
  assert.equal(result.status, 0, result.stderr)
  assert.match(result.stdout, /memtrace 1\.2\.8/)
  assert.equal(run(['sh', '-c', 'test "$MEMTRACE_NO_AUTO_SETUP" = 1 && test -z "$MEMTRACE_LICENSE_KEY" && test ! -e /home/node/.config/memtrace/credentials.json']).status, 0)
})
