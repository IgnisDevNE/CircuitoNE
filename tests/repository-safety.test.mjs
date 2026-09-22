import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { test } from 'node:test'

test('credenciais e memória local de agentes ficam fora do Git', () => {
  const paths = ['.env.local', '.mcp.json', '.codex/config.toml', '.memdb/database.db', '.memtrace/session.json', '.claude/settings.json', '.agents/plugins/marketplace.json', '.sweep/surfaces.js']
  const ignored = execFileSync('git', ['check-ignore', '--no-index', '--stdin'], { input: paths.join('\n'), encoding: 'utf8' }).trim().split(/\r?\n/)
  assert.deepEqual(ignored, paths)
})

test('modelo de ambiente sem segredos pode ser versionado', () => {
  let ignored = false
  try {
    execFileSync('git', ['check-ignore', '--no-index', '.env.example'], { stdio: 'pipe' })
    ignored = true
  } catch (error) {
    if (error.status !== 1) throw error
  }
  assert.equal(ignored, false)
})
