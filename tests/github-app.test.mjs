import assert from 'node:assert/strict'
import { generateKeyPairSync, verify } from 'node:crypto'
import { test } from 'node:test'
import { createInstallationToken } from '../scripts/github-app.mjs'

test('o token do App usa assinatura válida e fica limitado ao CircuitoNE', async (t) => {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(url, 'https://api.github.com/app/installations/163660443/access_tokens')
    assert.equal(options.method, 'POST')
    const jwt = options.headers.Authorization.replace(/^Bearer /, '')
    const [header, payload, signature] = jwt.split('.')
    assert.equal(JSON.parse(Buffer.from(header, 'base64url')).alg, 'RS256')
    assert.ok(verify('RSA-SHA256', Buffer.from(`${header}.${payload}`), publicKey, Buffer.from(signature, 'base64url')))
    const claims = JSON.parse(Buffer.from(payload, 'base64url'))
    const now = Math.floor(Date.now() / 1000)
    assert.equal(claims.iss, '5028495')
    assert.ok(claims.iat <= now && claims.iat >= now - 65)
    assert.ok(claims.exp > now && claims.exp <= now + 600)
    assert.deepEqual(JSON.parse(options.body), {
      repository_ids: [1380574734],
      permissions: { contents: 'write', pull_requests: 'write', issues: 'write', actions: 'read', checks: 'read', statuses: 'read', metadata: 'read' },
    })
    return Response.json({ token: 'fake-test-token', expires_at: '2099-01-01T00:00:00Z' })
  })
  assert.equal((await createInstallationToken(privateKey)).token, 'fake-test-token')
})

test('falha de autenticação interrompe a execução sem revelar a resposta', async (t) => {
  const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
  t.mock.method(globalThis, 'fetch', async () => new Response('sensitive-test-response', { status: 401 }))
  await assert.rejects(createInstallationToken(privateKey), { message: 'GitHub App: falha ao emitir token (HTTP 401).' })
})
