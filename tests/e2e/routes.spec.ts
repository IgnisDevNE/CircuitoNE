import { expect, test } from '@playwright/test'

const publicRoutes = [
  ['/entrar', 'Entrar'],
  ['/cadastro', 'Cadastro'],
] as const

// /painel e /coletivo/* são reais: layout autenticado + dashboard no banco (tests/e2e/db/auth.spec.ts e dashboard.spec.ts).

test.beforeEach(async ({ page, baseURL }) => {
  await page.clock.setFixedTime(new Date('2026-09-22T15:00:00.000Z'))
  // O protótipo não precisa de serviços externos para esta caracterização.
  await page.route('**/*', (route) => new URL(route.request().url()).origin === baseURL
    ? route.continue()
    : route.abort())
})

test.afterEach(async ({ page }, info) => {
  const visualPaths = ['/cadastro']
  if (info.status === 'passed' && visualPaths.includes(new URL(page.url()).pathname)) {
    await info.attach('viewport', { body: await page.screenshot({ animations: 'disabled' }), contentType: 'image/png' })
  }
})

for (const [path, title] of publicRoutes) {
  test(`rota pública ${path}`, async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.goto(path)
    await expect(page).toHaveTitle(`${title} · CIRCUITO NE`)
    await expect(page.getByRole('heading').first()).toBeVisible()
    expect(errors).toEqual([])
  })
}

test('o painel não existe sem Supabase: o preview não simula sessão nem dados', async ({ page }) => {
  const response = await page.goto('/painel')
  expect(response?.status()).toBe(503)
  await expect(page.getByRole('alert')).toContainText('Não foi possível carregar')
})

test('rota desconhecida permite voltar ao início', async ({ page }) => {
  await page.goto('/rota-inexistente')
  await expect(page.getByText('404 — página não encontrada.', { exact: false })).toBeVisible()
  await page.getByRole('link', { name: 'voltar ao início', exact: true }).click()
  // A home é servida pelo banco (tests/e2e/db/home.spec.ts); sem Supabase, o preview só confirma a navegação.
  await expect(page).toHaveURL(/\/$/)
})

test('parâmetro com escape inválido é rejeitado sem quebrar a página', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  // O runtime SSR rejeita a URL malformada com 400.
  for (const path of ['/artistas/%E0%A4%A', '/painel/perfil/%E0%A4%A']) {
    const response = await page.goto(path)
    expect(response?.status()).toBe(400)
  }
  await page.goto('/rota-inexistente')
  await expect(page.getByRole('link', { name: 'voltar ao início', exact: true })).toBeVisible()
  expect(errors).toEqual([])
})
