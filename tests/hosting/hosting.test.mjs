import assert from 'node:assert/strict'
import { test } from 'node:test'

const base = process.env.HOSTING_URL || 'http://127.0.0.1:5176'

test('o container renderiza páginas públicas no servidor e entrega os assets', async () => {
  const home = await fetch(base)
  assert.equal(home.status, 200)
  const html = await home.text()
  assert.match(html, /<html lang="pt-BR"/)
  assert.match(html, /conectando a cena eletrônica do nordeste/i)
  assert.match(html, /<title>Início · CIRCUITO NE<\/title>/)
  assert.match(html, /<meta name="robots" content="noindex, nofollow"/)
  assert.doesNotMatch(html, /Figma Make App|Streamline document management/i)

  const deep = await fetch(`${base}/artistas/art-anerie`)
  assert.equal(deep.status, 200, 'recarregar uma rota não pode devolver 404')
  const artistHtml = await deep.text()
  assert.match(artistHtml, /<title>ANERIE · CIRCUITO NE<\/title>/)
  assert.match(artistHtml, /Produtora e DJ recifense/)

  const login = await fetch(`${base}/entrar`)
  assert.equal(login.status, 200)
  const loginHtml = await login.text()
  assert.match(loginHtml, /<title>Entrar · CIRCUITO NE<\/title>/)
  assert.match(loginHtml, /Este é um protótipo/)
  assert.doesNotMatch(loginHtml, /Um hub independente/)

  const asset = html.match(/<link rel="modulepreload" href="([^" ]+\.js)"/)?.[1]
  assert.ok(asset, 'build deve referenciar um bundle JavaScript')
  const bundle = await fetch(new URL(asset, base))
  assert.equal(bundle.status, 200)
  assert.match(bundle.headers.get('content-type'), /javascript/)
  assert.ok((await bundle.arrayBuffer()).byteLength > 0)
})

test('arquivos internos e assets inexistentes não recebem o HTML da SPA', async () => {
  for (const path of ['/.env', '/.git/config', '/assets/arquivo-inexistente.js', '/pagina-inexistente']) {
    const response = await fetch(base + path)
    await response.arrayBuffer()
    assert.equal(response.status, 404, path)
  }
})
