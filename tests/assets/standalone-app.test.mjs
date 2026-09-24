import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

test('o build SSR publica cliente e servidor sem metadados do Figma', () => {
  execFileSync(process.execPath, ['node_modules/@react-router/dev/bin.cjs', 'build'], { stdio: 'pipe' })
  const server = join('build', 'server', 'index.js')
  assert.ok(existsSync(server))
  assert.doesNotMatch(readFileSync(server, 'utf8'), /Figma Make App|Streamline document management/i)
  assert.equal(readFileSync(join('build', 'client', 'robots.txt'), 'utf8'), 'User-agent: *\nDisallow: /\n')
})
