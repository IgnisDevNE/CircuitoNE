import { expect, test } from '@playwright/test'

// Fixtures: eventos de supabase/seeds/events.sql (1 e 6 futuros, 2 em andamento, 3 passado, 4 cancelado,
// 5 rascunho, 7 de coletivo suspenso), artista publicado de identity.sql e coletivos de collectives.sql
// (1 e 6 aprovados; 2 a 5 pendente/suspenso/rejeitado/encerrado).
const eventName = (n: number) => `Evento sintético ${n}`
const artistId = '02000000-0000-4000-8000-000000000001'
const collectiveId = (n: number) => `05000000-0000-4000-8000-${String(n).padStart(12, '0')}`

let errors: string[]
test.beforeEach(({ page }) => {
  errors = []
  page.on('pageerror', (error) => errors.push(error.message))
})
test.afterEach(() => {
  expect(errors).toEqual([])
})

test('home mostra os próximos eventos publicados, artistas publicados e coletivos aprovados', async ({ page }) => {
  const response = await page.goto('/')
  expect(response?.status()).toBe(200)
  expect(response?.headers()['cache-control']).toContain('no-store')
  await expect(page).toHaveTitle('Início · CIRCUITO NE')
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()

  // O evento 8 (sem fim) pode ou não estar em andamento conforme o horário: só os fixos são afirmados.
  const events = page.locator('main a[href^="/eventos/"] h3')
  await expect(events.first()).toBeVisible()
  const titles = await events.allTextContents()
  expect(titles.length).toBeLessThanOrEqual(3)
  expect(titles).toContain(eventName(2))
  expect(titles.indexOf(eventName(2))).toBeLessThan(titles.indexOf(eventName(1)))
  for (const n of [3, 4, 5, 7]) expect(titles).not.toContain(eventName(n))

  await expect(page.getByRole('link', { name: /Artista sintético público/ })).toHaveAttribute('href', `/artistas/${artistId}`)
  for (const hidden of ['Projeto sintético interno', 'Artista sintético suspenso']) await expect(page.getByText(hidden)).toHaveCount(0)

  await expect(page.getByRole('link', { name: /Organização sintética 1/ })).toHaveAttribute('href', `/coletivos/${collectiveId(1)}`)
  await expect(page.getByRole('link', { name: /Organização sintética 6/ })).toHaveAttribute('href', `/coletivos/${collectiveId(6)}`)
  for (const n of [2, 3, 4, 5]) await expect(page.getByText(`Organização sintética ${n}`)).toHaveCount(0)
})

test('painel de boot mostra os totais do banco', async ({ page }) => {
  await page.goto('/')
  // Cada linha do painel é "› <texto>"; a regex ancorada evita casar 11, 12… com 1.
  await expect(page.getByText(/artistas conectados: 1$/)).toBeVisible()
  await expect(page.getByText(/coletivos\/produtoras: 2$/)).toBeVisible()
})

test('hidrata a home com os mesmos eventos do servidor mesmo se o navegador estiver em outra data', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2030-01-01T12:00:00.000Z'))
  const response = await page.goto('/')
  expect(response?.status()).toBe(200)
  const serverEvents = await page.evaluate(
    (html) => [...new DOMParser().parseFromString(html, 'text/html').querySelectorAll('main a[href^="/eventos/"] h3')]
      .map((heading) => heading.textContent?.trim()),
    await response!.text(),
  )
  expect(serverEvents).toContain(eventName(2))
  await expect(page.locator('main a[href^="/eventos/"] h3')).toHaveText(serverEvents as string[])
})

test('jornada pública por links, voltar e avançar', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('link', { name: 'Explorar artistas', exact: true }).click()
  await expect(page).toHaveURL(/\/artistas$/)
  await expect(page).toHaveTitle('Artistas · CIRCUITO NE')
  await page.goBack()
  await expect(page).toHaveTitle('Início · CIRCUITO NE')
  await page.goForward()
  await expect(page).toHaveTitle('Artistas · CIRCUITO NE')
})

test('cartões da home levam ao detalhe de evento e ao perfil do artista', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('link', { name: /Artista sintético público/ }).click()
  await expect(page).toHaveURL(new RegExp(`/artistas/${artistId}$`))
  await page.goBack()
  await page.locator('main a[href^="/eventos/"]').first().click()
  await expect(page).toHaveURL(/\/eventos\/0a000000-/)
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
})
