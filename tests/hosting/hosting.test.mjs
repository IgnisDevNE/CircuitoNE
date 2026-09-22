import assert from 'node:assert/strict'
import { test } from 'node:test'

const base = process.env.HOSTING_URL || 'http://127.0.0.1:5176'

test('o container serve a SPA também em links profundos e entrega os assets', async () => {
  const home = await fetch(base)
  assert.equal(home.status, 200)
  const html = await home.text()
  assert.match(html, /<div id="root"><\/div>/)

  const deep = await fetch(`${base}/artistas/art-anerie`)
  assert.equal(deep.status, 200, 'recarregar uma rota não pode devolver 404')
  assert.equal(await deep.text(), html)

  const asset = html.match(/src="([^" ]+\.js)"/)?.[1]
  assert.ok(asset, 'build deve referenciar um bundle JavaScript')
  const bundle = await fetch(new URL(asset, base))
  assert.equal(bundle.status, 200)
  assert.match(bundle.headers.get('content-type'), /javascript/)
  assert.ok((await bundle.arrayBuffer()).byteLength > 0)
})

test('arquivos internos e assets inexistentes não recebem o HTML da SPA', async () => {
  for (const path of ['/.env', '/.git/config', '/assets/arquivo-inexistente.js']) {
    const response = await fetch(base + path)
    await response.arrayBuffer()
    assert.equal(response.status, 404, path)
  }
})
