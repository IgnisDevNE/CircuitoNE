import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export function githubCommand(command, args, environment = process.env) {
  if (!['gh', 'git'].includes(command) || !args.length) throw new Error('Uso: node scripts/github-app.mjs <gh|git> <argumentos>')
  const token = environment.GITHUB_APP_TOKEN
  if (!token?.trim()) throw new Error('GitHub App: forneça token temporário emitido pelo mantenedor fora do container.')
  if (!(Date.parse(environment.GITHUB_APP_TOKEN_EXPIRES_AT) > Date.now())) throw new Error('GitHub App: token expirado ou validade ausente; solicite renovação ao mantenedor.')
  const env = { ...environment }
  for (const name of ['GITHUB_TOKEN', 'GITHUB_APP_PRIVATE_KEY_FILE', 'GITHUB_APP_ACTIONS_WRITE', 'GITHUB_APP_WORKFLOWS_WRITE']) delete env[name]
  return {
    args: command === 'git'
      ? ['-c', 'credential.helper=', '-c', 'credential.helper=!gh auth git-credential', '-c', 'core.askPass=', '-c', 'user.name=ignisdevne[bot]', '-c', 'user.email=332310975+ignisdevne[bot]@users.noreply.github.com', ...args]
      : args,
    env: { ...env, GH_TOKEN: token, GH_HOST: 'github.com', GH_REPO: 'IgnisDevNE/CircuitoNE', GH_PROMPT_DISABLED: '1', GIT_TERMINAL_PROMPT: '0' },
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const [command, ...args] = process.argv.slice(2)
    const prepared = githubCommand(command, args)
    const child = spawnSync(command, prepared.args, {
      stdio: 'inherit',
      env: prepared.env,
    })
    if (child.error) throw child.error
    process.exitCode = child.status ?? 1
  } catch (error) {
    console.error(error.message)
    process.exitCode = 1
  }
}
