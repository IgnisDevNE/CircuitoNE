import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync, unlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve, join, dirname, basename } from 'node:path'
import { randomUUID, createHash } from 'node:crypto'

test('documentos e ferramentas locais não alteram o CSS distribuído', () => {
  const output = mkdtempSync(join(tmpdir(), 'circuitone-css-'))
  assert.equal(dirname(resolve(output)), resolve(tmpdir()))
  assert.ok(basename(output).startsWith('circuitone-css-'))
  const probe = resolve('docs', `css-probe-${randomUUID()}.txt`)
  const buildCSS = () => {
    execFileSync(process.execPath, ['node_modules/vite/bin/vite.js', 'build', '--configLoader', 'native', '--outDir', output, '--emptyOutDir'], { stdio: 'pipe' })
    const css = readdirSync(join(output, 'assets')).filter(name => name.endsWith('.css')).sort()
      .map(name => readFileSync(join(output, 'assets', name), 'utf8')).join('\n')
    assert.ok(css.length > 0)
    return createHash('sha256').update(css).digest('hex')
  }
  try {
    const baseline = buildCSS()
    writeFileSync(probe, ['z-', '[', '987654321', ']'].join(''), { flag: 'wx' })
    assert.equal(buildCSS(), baseline)
  } finally {
    try { unlinkSync(probe) } catch (error) { if (error.code !== 'ENOENT') throw error }
    rmSync(output, { recursive: true, force: true })
  }
})
