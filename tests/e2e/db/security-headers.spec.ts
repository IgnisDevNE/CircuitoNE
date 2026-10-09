import { expect, test } from '@playwright/test'

// Cabeçalhos de segurança do documento (B1): CSP com nonce por requisição, anti-clickjacking, nosniff e afins. Só lê páginas
// públicas; a hidratação precisa funcionar sob a CSP (o script inline de hidratação leva o nonce) e nenhuma página pode
// disparar violação (evento `securitypolicyviolation` ou mensagem do console).
const artist = '02000000-0000-4000-8000-000000000001'
const event = '0a000000-0000-4000-8000-000000000001'
const paths = ['/', '/artistas', `/artistas/${artist}`, '/eventos', `/eventos/${event}`, '/coletivos', '/manifesto', '/entrar', '/cadastro']

const nonceOf = (csp: string) => /script-src 'self' 'nonce-([^']+)'/.exec(csp)?.[1]

test('documento: CSP com nonce, anti-clickjacking, nosniff, referrer, permissões e COOP', async ({ request }) => {
  const response = await request.get('/')
  expect(response.status()).toBe(200)
  const headers = response.headers()
  const csp = headers['content-security-policy']
  expect(csp).toContain("default-src 'self'")
  expect(csp).toContain("object-src 'none'")
  expect(csp).toContain("base-uri 'none'")
  expect(csp).toContain("form-action 'self'")
  expect(csp).toContain("frame-ancestors 'none'")
  expect(csp).not.toMatch(/script-src[^;]*unsafe-inline/)
  expect(headers['x-frame-options']).toBe('DENY')
  expect(headers['x-content-type-options']).toBe('nosniff')
  expect(headers['referrer-policy']).toBe('strict-origin-when-cross-origin')
  expect(headers['permissions-policy']).toBe('camera=(), microphone=(), geolocation=(), payment=()')
  expect(headers['cross-origin-opener-policy']).toBe('same-origin')

  // O script inline de hidratação carrega o nonce da resposta, e o nonce muda a cada requisição.
  const nonce = nonceOf(csp)!
  expect(nonce.length).toBeGreaterThanOrEqual(16)
  const html = await response.text()
  const inline = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>/g)].map((match) => match[0])
  expect(inline.length).toBeGreaterThan(0)
  for (const tag of inline) expect(tag).toContain(`nonce="${nonce}"`)
  const other = await request.get('/')
  expect(nonceOf(other.headers()['content-security-policy']!)).not.toBe(nonce)
})

test('respostas de dados e de imagem também não permitem sniffing de tipo', async ({ request }) => {
  expect((await request.get('/artistas.data')).headers()['x-content-type-options']).toBe('nosniff')
  expect((await request.get('/img/inexistente.png')).headers()['x-content-type-options']).toBe('nosniff')
})

for (const path of paths) {
  test(`${path}: hidrata sob a CSP, sem violações`, async ({ page }) => {
    const violations: string[] = []
    page.on('console', (message) => {
      if (/content security policy|refused to (load|execute|apply|connect)/i.test(message.text())) violations.push(message.text())
    })
    await page.addInitScript(() => {
      const found: string[] = ((window as unknown as { __csp: string[] }).__csp = [])
      document.addEventListener('securitypolicyviolation', (event) => found.push(`${event.violatedDirective} ${event.blockedURI}`))
    })
    const response = await page.goto(path)
    expect(response?.headers()['content-security-policy']).toContain("'nonce-")
    // Hidratado: o React Router marcou os elementos do documento.
    await expect.poll(() => page.locator('body a').first().evaluate((element) => Object.keys(element).some((key) => key.startsWith('__reactFiber')))).toBe(true)
    await page.waitForLoadState('networkidle')
    expect(await page.evaluate(() => (window as unknown as { __csp: string[] }).__csp)).toEqual([])
    expect(violations).toEqual([])
  })
}
