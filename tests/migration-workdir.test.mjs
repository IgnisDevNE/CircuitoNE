import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { join, resolve, dirname, basename } from 'node:path'
import { tmpdir } from 'node:os'
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { prepareLocalDatabase } from '../scripts/prepare-local-db.mjs'

const first = '20260922052133_adapter_first.sql'
const second = '20260922052135_adapter_second.sql'

test('migrações preservam bytes, ordem e checksum em cópia descartável, sem tocar a origem', () => {
  const root = mkdtempSync(join(tmpdir(), 'circuitone-migrations-'))
  assert.equal(dirname(resolve(root)), resolve(tmpdir()))
  assert.ok(basename(root).startsWith('circuitone-migrations-'))
  try {
    const source = join(root, 'docs/migrations')
    mkdirSync(source, { recursive: true })
    mkdirSync(join(root, 'supabase'))
    const config = readFileSync('supabase/config.toml')
    writeFileSync(join(root, 'supabase/config.toml'), config)
    const sql = Buffer.from('-- sintético; acentuação\r\nselect 1;\r\n')
    writeFileSync(join(source, second), 'select 2;')
    writeFileSync(join(source, first), sql)
    writeFileSync(join(source, 'README.md'), 'não copiar')
    const workdir = prepareLocalDatabase(root)
    assert.equal(dirname(workdir), root)
    assert.deepEqual(readdirSync(join(workdir, 'supabase/migrations')), [first, second])
    assert.deepEqual(readFileSync(join(workdir, 'supabase/migrations', first)), sql)
    assert.deepEqual(readFileSync(join(source, first)), sql)
    const manifest = JSON.parse(readFileSync(join(workdir, 'manifest.json'), 'utf8'))
    assert.deepEqual(manifest.migrations.map(item => item.file), [first, second])
    assert.equal(manifest.migrations[0].sha256, createHash('sha256').update(sql).digest('hex'))
    assert.equal(manifest.configSha256, createHash('sha256').update(config).digest('hex'))
    const other = prepareLocalDatabase(root)
    assert.notEqual(other, workdir)
    assert.deepEqual(readFileSync(join(other, 'manifest.json')), readFileSync(join(workdir, 'manifest.json')))

    writeFileSync(join(source, '20260922052133_duplicate.sql'), 'select 3;')
    assert.throws(() => prepareLocalDatabase(root), /versão duplicada/)
    rmSync(join(source, '20260922052133_duplicate.sql'))
    writeFileSync(join(source, 'bad.SQL'), 'select 4;')
    assert.throws(() => prepareLocalDatabase(root), /nome inválido/)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('preparo local recusa argumentos de destino remoto antes de qualquer operação', () => {
  for (const args of [['--linked'], ['--db-url', 'postgresql://example.invalid/db'], ['--project-ref', 'mwgccjvztzbderlwtheg']]) {
    const result = spawnSync(process.execPath, ['scripts/prepare-local-db.mjs', ...args], { encoding: 'utf8' })
    assert.equal(result.status, 1)
    assert.match(result.stderr, /não aceita argumentos/)
    assert.equal(result.stdout, '')
  }
})
