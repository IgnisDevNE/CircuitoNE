import { sign } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export async function createInstallationToken(privateKey) {
  const now = Math.floor(Date.now() / 1000)
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url')
  const unsigned = `${encode({ alg: 'RS256', typ: 'JWT' })}.${encode({ iat: now - 60, exp: now + 540, iss: '5028495' })}`
  const jwt = `${unsigned}.${sign('RSA-SHA256', Buffer.from(unsigned), privateKey).toString('base64url')}`
  const response = await fetch('https://api.github.com/app/installations/163660443/access_tokens', {
    method: 'POST',
    headers: { Authorization: `Bearer ${jwt}`, Accept: 'application/vnd.github+json', 'Content-Type': 'application/json', 'X-GitHub-Api-Version': '2026-03-10' },
    body: JSON.stringify({
      repository_ids: [1380574734],
      permissions: { contents: 'write', pull_requests: 'write', issues: 'write', actions: 'read', checks: 'read', statuses: 'read', metadata: 'read' },
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

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const [command, ...args] = process.argv.slice(2)
    if (!['gh', 'git'].includes(command) || !args.length) throw new Error('Uso: node scripts/github-app.mjs <gh|git> <argumentos>')
    const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
    const keyPath = process.env.GITHUB_APP_PRIVATE_KEY_FILE || resolve(root, 'secrets/ignisdevne.2026-09-21.private-key.pem')
    const { token } = await createInstallationToken(readFileSync(keyPath, 'utf8'))
    const commandArgs = command === 'git'
      ? ['-c', 'credential.helper=', '-c', 'credential.helper=!gh auth git-credential', '-c', 'core.askPass=', '-c', 'user.name=ignisdevne[bot]', '-c', 'user.email=332310975+ignisdevne[bot]@users.noreply.github.com', ...args]
      : args
    const child = spawnSync(command, commandArgs, {
      stdio: 'inherit',
      env: { ...process.env, GH_TOKEN: token, GH_HOST: 'github.com', GH_REPO: 'IgnisDevNE/CircuitoNE', GH_PROMPT_DISABLED: '1', GIT_TERMINAL_PROMPT: '0' },
    })
    if (child.error) throw child.error
    process.exitCode = child.status ?? 1
  } catch (error) {
    console.error(error.message)
    process.exitCode = 1
  }
}
