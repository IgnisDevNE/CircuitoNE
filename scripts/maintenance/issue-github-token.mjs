// Executar exclusivamente no contexto do mantenedor, fora do container do agente.
import { sign } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { githubCommand } from '../github-app.mjs'

export async function createInstallationToken(privateKey, maintenance = false) {
  const now = Math.floor(Date.now() / 1000)
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url')
  const unsigned = `${encode({ alg: 'RS256', typ: 'JWT' })}.${encode({ iat: now - 60, exp: now + 540, iss: '5028495' })}`
  const jwt = `${unsigned}.${sign('RSA-SHA256', Buffer.from(unsigned), privateKey).toString('base64url')}`
  const response = await fetch('https://api.github.com/app/installations/163660443/access_tokens', {
    method: 'POST',
    headers: { Authorization: `Bearer ${jwt}`, Accept: 'application/vnd.github+json', 'Content-Type': 'application/json', 'X-GitHub-Api-Version': '2026-03-10' },
    body: JSON.stringify({
      repository_ids: [1380574734],
      permissions: {
        contents: 'write', pull_requests: 'write', issues: 'write', checks: 'read', statuses: 'read', metadata: 'read',
        actions: maintenance && process.env.GITHUB_APP_ACTIONS_WRITE === '1' ? 'write' : 'read',
        ...(maintenance && process.env.GITHUB_APP_WORKFLOWS_WRITE === '1' ? { workflows: 'write' } : {}),
      },
    }),
    signal: AbortSignal.timeout(15000),
  })
  if (!response.ok) throw new Error(`GitHub App: falha ao emitir token (HTTP ${response.status}).`)
  const result = await response.json()
  if (typeof result.token !== 'string' || !result.token || !(Date.parse(result.expires_at) > Date.now())) {
    throw new Error('GitHub App: resposta de token inválida.')
  }
  return result
}

export function tokenCommand(args, credential, environment = process.env) {
  return {
    args: ['exec', '--interactive', '--tty', '--workdir', '/workspace/circuito-ne', '--env', 'GITHUB_APP_TOKEN', '--env', 'GITHUB_APP_TOKEN_EXPIRES_AT', 'circuitone-agent', ...args],
    env: { ...environment, GITHUB_APP_TOKEN: credential.token, GITHUB_APP_TOKEN_EXPIRES_AT: credential.expires_at },
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (!process.env.GITHUB_APP_PRIVATE_KEY_FILE) throw new Error('Mantenedor: informe GITHUB_APP_PRIVATE_KEY_FILE externo ao container.')
    const args = process.argv.slice(2)
    const host = args[0] === '--host'
    if (!host) {
      const guard = spawnSync('pwsh.exe', ['-NoProfile', '-File', fileURLToPath(new URL('../../deploy/agent/manage.ps1', import.meta.url)), '-Action', 'Verify'], { stdio: 'inherit' })
      if (guard.error || guard.status !== 0) throw new Error('Agente sem isolamento validado; nenhum token emitido.')
    }
    const result = await createInstallationToken(readFileSync(process.env.GITHUB_APP_PRIVATE_KEY_FILE, 'utf8'), host)
    const command = host
      ? githubCommand(args[1], args.slice(2), { ...process.env, GITHUB_APP_TOKEN: result.token, GITHUB_APP_TOKEN_EXPIRES_AT: result.expires_at })
      : tokenCommand(args.length ? args : ['circuitone-agent'], result)
    console.log('Token temporário apenas em memória. Expira em ' + result.expires_at)
    const child = spawnSync(host ? args[1] : 'podman', command.args, { stdio: 'inherit', env: command.env })
    if (child.error) throw new Error('Falha ao iniciar o processo no agente.')
    process.exitCode = child.status ?? 1
  } catch (error) {
    console.error(error.message)
    process.exitCode = 1
  }
}
