// Contexto do mantenedor. Não montar este checkout no container do agente.
import { execFileSync } from 'node:child_process'
import { closeSync, existsSync, openSync, realpathSync, unlinkSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export function syncCheckout(checkout, fetchRemote) {
  checkout = resolve(checkout)
  if (realpathSync(checkout) !== checkout) throw new Error('Checkout redirecionado; confira o caminho real.')
  const devNull = process.platform === 'win32' ? 'NUL' : '/dev/null'
  const git = (...args) => execFileSync('git', ['-c', 'credential.helper=', '-c', 'core.hooksPath=' + devNull, '-c', 'core.fsmonitor=false', '-c', 'http.followRedirects=false', ...args], {
    cwd: checkout, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 30_000, maxBuffer: 1024 * 1024,
    env: { ...process.env, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: devNull, GIT_TERMINAL_PROMPT: '0', GCM_INTERACTIVE: 'Never' },
  }).trim()
  fetchRemote ??= (remote, refspec) => git('fetch', '--no-tags', remote, refspec)
  const snapshot = () => {
    const localKeys = git('config', '--local', '--name-only', '--list').split('\n')
    if (localKeys.some(key => /^(http\.|credential\.|url\.|include\.|includeif\.|filter\.|remote\..*\.(proxy|vcs)$|core\.(gitproxy|sshcommand)$)/i.test(key))) throw new Error('A configuração Git local contém autenticação/transporte personalizado; revisar no host antes da sincronização.')
    if (git('symbolic-ref', '--quiet', 'HEAD') !== 'refs/heads/main' || git('config', '--get', 'branch.main.remote') !== 'origin' || git('config', '--get', 'branch.main.merge') !== 'refs/heads/main') throw new Error('Checkout deve estar em main vinculada à origin/main.')
    if (git('status', '--porcelain', '--untracked-files=all')) throw new Error('Árvore/índice devem estar limpos; preserve sua edição e use uma main limpa.')
    for (const name of ['MERGE_HEAD', 'CHERRY_PICK_HEAD', 'REVERT_HEAD', 'rebase-merge', 'rebase-apply', 'sequencer', 'index.lock']) {
      if (existsSync(resolve(checkout, git('rev-parse', '--git-path', name)))) throw new Error('Há uma operação Git pendente.')
    }
    if (git('remote', 'get-url', 'origin') !== 'https://github.com/IgnisDevNE/CircuitoNE.git') throw new Error('A origem do checkout não é CircuitoNE.')
    return git('rev-parse', 'HEAD')
  }
  const before = snapshot()
  const lockPath = resolve(checkout, git('rev-parse', '--git-path', 'circuitone-sync.lock'))
  let lock
  try { lock = openSync(lockPath, 'wx') } catch { throw new Error('Outra execução de sincronização está ativa; confira antes de remover a trava.') }
  try {
    fetchRemote('origin', 'refs/heads/main:refs/remotes/origin/main')
    const target = git('rev-parse', 'refs/remotes/origin/main')
    fetchRemote('https://github.com/IgnisDevNE/CircuitoNE-QA.git', 'refs/heads/accepted:refs/remotes/circuitone-qa/accepted')
    const accepted = git('rev-parse', 'refs/remotes/circuitone-qa/accepted')
    let state
    try { state = JSON.parse(git('show', `${accepted}:.qa/state.json`)) } catch { throw new Error('Estado da promoção QA ausente/inválido.') }
    if (state.source_main_sha !== target || !Number.isSafeInteger(state.promoted_source_pr) || state.promoted_source_pr < 1 || !Number.isSafeInteger(state.source_run_id) || !/^[a-f0-9]{40}$/.test(state.promoted_suite_sha) || !/^[a-f0-9]{40}$/.test(state.promotion_workflow_sha)) throw new Error('Aguardar promoção QA do commit exato de main.')
    if (snapshot() !== before) throw new Error('Checkout mudou durante a sincronização; tente novamente sem edição concorrente.')
    try { git('merge-base', '--is-ancestor', before, target) } catch { throw new Error('Main local divergente ou adiantada; preserve os commits e resolva manualmente.') }
    git('merge', '--ff-only', target)
    return { sha: target, accepted, pullRequest: state.promoted_source_pr }
  } finally { closeSync(lock); unlinkSync(lockPath) }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const [checkout, ...extra] = process.argv.slice(2)
    if (!checkout || extra.length) throw new Error('Uso no host: node scripts/maintenance/sync-checkout.mjs D:/Repos/circuito-ne')
    console.log(JSON.stringify(syncCheckout(checkout)))
  } catch (error) {
    console.error(error.status === undefined ? error.message : 'Falha de leitura/Git; o checkout não foi forçado. Confira rede e estado local.')
    process.exitCode = 1
  }
}
