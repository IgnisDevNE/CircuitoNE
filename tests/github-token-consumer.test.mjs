import assert from 'node:assert/strict'
import { test } from 'node:test'
import { githubCommand } from '../scripts/github-app.mjs'
import { tokenCommand } from '../scripts/maintenance/issue-github-token.mjs'

test('maintainer passes only the temporary token by environment, never in arguments or a file', () => {
  const result = tokenCommand(['circuitone-agent'], { token: 'synthetic-secret', expires_at: '2099-01-01T00:00:00Z' }, { PATH: '/bin' })
  assert.equal(result.args.includes('synthetic-secret'), false)
  assert.deepEqual(result.args, ['exec', '--interactive', '--tty', '--workdir', '/workspace/circuito-ne', '--env', 'GITHUB_APP_TOKEN', '--env', 'GITHUB_APP_TOKEN_EXPIRES_AT', 'circuitone-agent', 'circuitone-agent'])
  assert.equal(result.env.GITHUB_APP_TOKEN, 'synthetic-secret')
  assert.equal(result.env.GITHUB_APP_TOKEN_EXPIRES_AT, '2099-01-01T00:00:00Z')
})

test('consumer requires an unexpired installation token, never a key or saved login', () => {
  const human = { GH_TOKEN: 'human-canary', GITHUB_TOKEN: 'human-canary', GITHUB_APP_PRIVATE_KEY_FILE: '/host/key.pem' }
  assert.throws(() => githubCommand('gh', ['pr', 'list'], human), /token temporário/)
  assert.throws(() => githubCommand('gh', ['pr', 'list'], { ...human, GITHUB_APP_TOKEN: 'synthetic', GITHUB_APP_TOKEN_EXPIRES_AT: '2000-01-01T00:00:00Z' }), /expirado/)
  const env = { ...human, GITHUB_APP_TOKEN: 'synthetic-installation-token', GITHUB_APP_TOKEN_EXPIRES_AT: new Date(Date.now()+60_000).toISOString(), GITHUB_APP_ACTIONS_WRITE: '1', GITHUB_APP_WORKFLOWS_WRITE: '1', PATH: '/bin' }
  const command = githubCommand('git', ['push'], env)
  assert.equal(command.env.GH_TOKEN, env.GITHUB_APP_TOKEN)
  assert.equal(command.env.GH_REPO, 'IgnisDevNE/CircuitoNE')
  for (const name of ['GITHUB_TOKEN', 'GITHUB_APP_PRIVATE_KEY_FILE', 'GITHUB_APP_ACTIONS_WRITE', 'GITHUB_APP_WORKFLOWS_WRITE']) assert.equal(command.env[name], undefined)
  assert.ok(command.args.includes('credential.helper='))
  assert.ok(command.args.includes('core.askPass='))
  assert.ok(command.args.includes('user.name=ignisdevne[bot]'))
  assert.equal(command.env.GIT_TERMINAL_PROMPT, '0')
  assert.throws(() => githubCommand('sh', ['-c', 'anything'], env), /Uso:/)
})
