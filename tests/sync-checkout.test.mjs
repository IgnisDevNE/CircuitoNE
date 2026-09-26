import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { syncCheckout } from '../scripts/maintenance/sync-checkout.mjs'

const sourceUrl = 'https://github.com/IgnisDevNE/CircuitoNE.git'
const qaUrl = 'https://github.com/IgnisDevNE/CircuitoNE-QA.git'
function git(cwd, ...args) { return execFileSync('git', ['-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', ...args], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim() }

test('host sync only fast-forwards a clean main to the exact promoted commit', () => {
  const dir = mkdtempSync(join(tmpdir(), 'circuitone-sync-'))
  const source = join(dir, 'source'), qa = join(dir, 'qa'), checkout = join(dir, 'checkout')
  try {
    for (const repo of [source, qa]) { mkdirSync(repo); git(repo, 'init', '-b', repo === source ? 'main' : 'accepted') }
    writeFileSync(join(source, 'file.txt'), 'old')
    git(source, 'add', '.'); git(source, 'commit', '-m', 'base')
    git(dir, 'clone', source, checkout)
    git(checkout, 'remote', 'set-url', 'origin', sourceUrl)
    const fetchRemote = (remote, refspec) => {
      assert.ok(remote === 'origin' || remote === qaUrl)
      git(checkout, 'fetch', '--no-tags', remote === 'origin' ? source : qa, refspec)
    }
    const sync = () => syncCheckout(checkout, fetchRemote)
    const initial = git(checkout, 'rev-parse', 'HEAD')
    writeFileSync(join(source, 'file.txt'), 'new')
    git(source, 'commit', '-am', 'promotable')
    const target = git(source, 'rev-parse', 'HEAD')
    mkdirSync(join(qa, '.qa'))
    const stateFile = join(qa, '.qa/state.json')
    const state = { source_main_sha: target, promoted_source_pr: 121, source_run_id: 1, promoted_suite_sha: initial, promotion_workflow_sha: initial }
    const publish = value => { writeFileSync(stateFile, JSON.stringify(value)); git(qa, 'add', '.'); git(qa, 'commit', '--allow-empty', '-m', 'state') }
    publish(state)
    const rejects = pattern => { assert.throws(sync, pattern); assert.equal(git(checkout, 'rev-parse', 'HEAD'), initial) }

    writeFileSync(join(checkout, 'file.txt'), 'human edit'); rejects(/limpa/)
    assert.equal(readFileSync(join(checkout, 'file.txt'), 'utf8'), 'human edit')
    git(checkout, 'restore', 'file.txt')
    writeFileSync(join(checkout, 'untracked.txt'), 'keep'); rejects(/limpa/); rmSync(join(checkout, 'untracked.txt'))
    git(checkout, 'switch', '-c', 'work'); rejects(/main/); git(checkout, 'switch', 'main')
    writeFileSync(join(checkout, '.git/MERGE_HEAD'), initial); rejects(/operação/); rmSync(join(checkout, '.git/MERGE_HEAD'))
    writeFileSync(join(checkout, '.git/circuitone-sync.lock'), 'another execution'); rejects(/execução/); rmSync(join(checkout, '.git/circuitone-sync.lock'))
    publish({ ...state, source_main_sha: initial }); rejects(/promoção/)
    publish({}); rejects(/promoção/)
    publish(state)
    git(checkout, 'config', 'http.https://github.com/.extraHeader', 'Authorization: synthetic-canary')
    rejects(/configuração Git local/)
    git(checkout, 'config', '--unset', 'http.https://github.com/.extraHeader')
    git(checkout, 'remote', 'set-url', 'origin', 'https://example.invalid/repo.git'); rejects(/origem/); git(checkout, 'remote', 'set-url', 'origin', sourceUrl)
    assert.throws(() => syncCheckout(checkout, () => { throw new Error('network unavailable') }), /network/)
    assert.equal(git(checkout, 'rev-parse', 'HEAD'), initial)
    assert.throws(() => syncCheckout(checkout, (remote, refspec) => {
      fetchRemote(remote, refspec)
      if (remote === qaUrl) writeFileSync(join(checkout, 'file.txt'), 'concurrent human edit')
    }), /limpa/)
    assert.equal(readFileSync(join(checkout, 'file.txt'), 'utf8'), 'concurrent human edit')
    assert.equal(git(checkout, 'rev-parse', 'HEAD'), initial)
    git(checkout, 'restore', 'file.txt')
    // Um hook local nunca é executado pela sincronização automática.
    writeFileSync(join(checkout, '.git/hooks/post-merge'), '#!/bin/sh\ntouch hook-ran\n', { mode: 0o755 })
    const result = sync()
    assert.equal(result.sha, target)
    assert.equal(git(checkout, 'rev-parse', 'HEAD'), target)
    assert.equal(readFileSync(join(checkout, 'file.txt'), 'utf8'), 'new')
    assert.equal(git(checkout, 'status', '--porcelain'), '')
    assert.equal(sync().sha, target)
    git(checkout, 'commit', '--allow-empty', '-m', 'local work')
    const local = git(checkout, 'rev-parse', 'HEAD')
    assert.throws(sync, /divergente/)
    assert.equal(git(checkout, 'rev-parse', 'HEAD'), local)
  } finally { rmSync(dir, { recursive: true, force: true }) }
})
