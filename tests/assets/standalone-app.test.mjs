import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

test('o build publica a identidade do CircuitoNE sem metadados do Figma', () => {
  const output = mkdtempSync(join(tmpdir(), 'circuitone-build-'))
  try {
    execFileSync(process.execPath, ['node_modules/vite/bin/vite.js', 'build', '--configLoader', 'native', '--outDir', output, '--emptyOutDir'], { stdio: 'pipe' })
    const html = readFileSync(join(output, 'index.html'), 'utf8')
    assert.match(html, /<html lang="pt-BR">/)
    assert.match(html, /<title>CircuitoNE<\/title>/)
    assert.match(html, /<meta name="robots" content="noindex, nofollow"/)
    assert.doesNotMatch(html, /figma|Streamline document management/i)
    assert.equal(readFileSync(join(output, 'robots.txt'), 'utf8'), 'User-agent: *\nDisallow: /\n')
  } finally {
    rmSync(output, { recursive: true, force: true })
  }
})
