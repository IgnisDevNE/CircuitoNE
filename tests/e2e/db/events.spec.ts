import { expect, test } from '@playwright/test'

// Fixtures de supabase/seeds/events.sql, relativas ao `seed_time` (carregado instantes antes da suíte):
//  1 publicado, +1 dia          2 publicado, em andamento (-1h..+1h)   3 publicado, passado (-7 dias)
//  4 cancelado, +1 dia          5 rascunho, +2 dias                    6 publicado, pago, +3 dias
//  7 publicado, +4 dias, de coletivo suspenso (invisível)              8 "outros", em andamento até o fim do dia
const eventId = (n: number) => `0a000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const eventName = (n: number) => `Evento sintético ${n}`
const collectiveId = '05000000-0000-4000-8000-000000000001'
const artistId = '02000000-0000-4000-8000-000000000001'

let errors: string[]
test.beforeEach(({ page }) => {
  errors = []
  page.on('pageerror', (error) => errors.push(error.message))
})
test.afterEach(() => {
  expect(errors).toEqual([])
})

test('agenda lista os eventos publicados em andamento e futuros, em andamento primeiro', async ({ page }) => {
  const response = await page.goto('/eventos')
  expect(response?.status()).toBe(200)
  expect(response?.headers()['cache-control']).toContain('no-store')
  await expect(page).toHaveTitle('Eventos Programados · CIRCUITO NE')
  await expect(page.getByRole('heading', { level: 3, name: eventName(1), exact: true })).toBeVisible()

  const titles = await page.locator('main li h3').allTextContents()
  // O evento 8 (sem fim) pode ou não estar em andamento conforme o horário da execução: não é afirmado.
  expect(titles.filter((t) => [eventName(1), eventName(2), eventName(6)].includes(t))).toEqual([
    eventName(2),
    eventName(1),
    eventName(6),
  ])
  for (const n of [3, 4, 5, 7]) expect(titles).not.toContain(eventName(n))

  const ongoing = page.getByRole('heading', { level: 3, name: eventName(2), exact: true }).locator('xpath=ancestor::li')
  await expect(ongoing.getByText('Em andamento')).toBeVisible()
  await expect(
    page.getByRole('heading', { level: 3, name: eventName(6), exact: true }).locator('xpath=ancestor::li').getByText('Ingresso'),
  ).toBeVisible()
})

test('filtro por UF e navegação da agenda até o detalhe', async ({ page }) => {
  await page.goto('/eventos')
  await expect(page.getByRole('group', { name: 'Filtrar por estado' })).toBeVisible()
  await page.getByRole('button', { name: 'PE', exact: true }).click()
  await expect(page.getByRole('heading', { level: 3, name: eventName(1), exact: true })).toBeVisible()
  await page.getByRole('link', { name: `Capa do evento ${eventName(1)}` }).click()
  await expect(page).toHaveURL(new RegExp(`/eventos/${eventId(1)}$`))
  await expect(page.getByRole('heading', { level: 1, name: eventName(1) })).toBeVisible()
})

test('detalhe mostra nome, coletivo, line-up vinculado e descrição', async ({ page }) => {
  const response = await page.goto(`/eventos/${eventId(1)}`)
  expect(response?.status()).toBe(200)
  await expect(page).toHaveTitle(`${eventName(1)} · CIRCUITO NE`)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(eventName(1))
  await expect(page.getByRole('link', { name: 'Organização sintética 1', exact: true })).toHaveAttribute(
    'href',
    `/coletivos/${collectiveId}`,
  )
  await expect(page.getByRole('link', { name: 'Artista sintético público', exact: true })).toHaveAttribute(
    'href',
    `/artistas/${artistId}`,
  )
  await expect(page.locator('main strong')).toHaveText('Fixture')
  await expect(page.getByRole('button', { name: 'Entrada gratuita' })).toBeVisible()
  await expect(page.getByText('(Fortaleza)').first()).toBeVisible()
})

test('detalhe de evento pago oferece o link de ingresso', async ({ page }) => {
  await page.goto(`/eventos/${eventId(6)}`)
  await expect(page.getByRole('link', { name: 'Comprar ingresso ↗' })).toHaveAttribute(
    'href',
    'https://tickets.example.invalid/fixture',
  )
})

test('detalhe de evento passado mantém crédito sem vínculo como texto', async ({ page }) => {
  const response = await page.goto(`/eventos/${eventId(3)}`)
  expect(response?.status()).toBe(200)
  await expect(page.getByText('Evento passado')).toBeVisible()
  await expect(page.getByText('Crédito sintético sem vínculo')).toBeVisible()
  await expect(page.getByRole('link', { name: 'Crédito sintético sem vínculo' })).toHaveCount(0)
})

test('detalhe de evento cancelado informa o cancelamento e não oferece ingresso', async ({ page }) => {
  const response = await page.goto(`/eventos/${eventId(4)}`)
  expect(response?.status()).toBe(200)
  await expect(page.getByText('Cancelado', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Entrada gratuita' })).toHaveCount(0)
})

for (const [label, id] of [
  ['rascunho', eventId(5)],
  ['coletivo suspenso', eventId(7)],
  ['id inexistente', eventId(99)],
  ['id que não é UUID', 'ev-porto'],
] as const) {
  test(`evento indisponível (${label}) responde 404 com estado "não encontrado"`, async ({ page }) => {
    const response = await page.goto(`/eventos/${id}`)
    expect(response?.status()).toBe(404)
    await expect(page).toHaveTitle('Evento não encontrado · CIRCUITO NE')
    await expect(page.getByText('Evento não encontrado.')).toBeVisible()
    await page.getByRole('link', { name: 'Voltar', exact: true }).click()
    await expect(page).toHaveURL(/\/eventos$/)
    await expect(page.getByRole('heading', { level: 1, name: 'eventos.log' })).toBeVisible()
  })
}
