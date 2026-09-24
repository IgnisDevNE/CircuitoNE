import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const read = (path) => readFileSync(path, 'utf8')

test('Node 24 LTS is used consistently by local tools, CI and the container', () => {
  const version = '24.21.0'
  const pkg = JSON.parse(read('package.json'))
  assert.equal(pkg.engines.node, '>=24.21.0 <25')
  assert.match(pkg.devDependencies['@types/node'], /^\^24\./)
  assert.match(read('.mise.toml'), /node = "24\.21\.0"/)
  assert.match(read('pnpm-workspace.yaml'), /useNodeVersion: 24\.21\.0/)

  for (const path of ['.github/workflows/ci.yml', '.github/workflows/homologate.yml', '.github/workflows/validate-production.yml']) {
    const versions = [...read(path).matchAll(/node-version: '([^']+)'/g)].map((match) => match[1])
    assert.ok(versions.length > 0, `${path} must set a Node version`)
    assert.ok(versions.every((value) => value === version), `${path} must use ${version}`)
  }

  assert.match(read('Dockerfile'), /^FROM docker\.io\/library\/node:24\.21\.0-alpine@sha256:[a-f0-9]{64} AS build/m)
})
