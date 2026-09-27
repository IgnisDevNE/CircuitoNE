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

test('Dependabot keeps React renderer updates together and Node types on the approved major', () => {
  const config = read('.github/dependabot.yml')
  assert.match(config, /react:\s+patterns: \['react', 'react-dom', '@types\/react', '@types\/react-dom'\]\s+update-types: \['minor', 'patch'\]/)
  assert.match(config, /ignore:\s+- dependency-name: '@types\/node'\s+versions: \['>=25'\]/)
})

test('Dependabot keeps Node images on the approved major and CodeQL steps together', () => {
  const config = read('.github/dependabot.yml')
  const docker = config.split('package-ecosystem: docker')[1]?.split('- package-ecosystem:')[0]
  const actions = config.split('package-ecosystem: github-actions')[1]
  assert.match(docker, /ignore:\s+- dependency-name: 'library\/node'\s+versions: \['>=25'\]/)
  assert.match(actions, /codeql:\s+patterns: \['github\/codeql-action\*'\]/)
})

test('CodeQL initialization and analysis use the same immutable action revision', () => {
  const workflow = read('.github/workflows/codeql.yml')
  const pins = [...workflow.matchAll(/uses: github\/codeql-action\/(init|analyze)@([a-f0-9]{40})/g)]
  assert.deepEqual(pins.map((match) => match[1]), ['init', 'analyze'])
  assert.equal(pins[0][2], pins[1][2])
})
