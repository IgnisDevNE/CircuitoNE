import { expect, test } from '@playwright/test'

// Fixtures de supabase/seeds/collectives.sql e events.sql (a suíte e2e do CI não carrega demo.sql):
//  coletivo 1 aprovado (coletivo, dono + membro ativo)   2 pendente   3 suspenso   4 rejeitado
//  5 encerrado                                           6 aprovado (produtora, só o dono)
// Eventos do coletivo 1: 1 (+1 dia), 2 (em andamento), 3 (passado), 4 (cancelado), 5 (rascunho), 6 (+3 dias) e 8 (sem fim;
// em andamento ou encerrado conforme o horário da execução, por isso não é afirmado). O evento 7 é do coletivo 3 (suspenso).
// Os membros da fixture não têm perfil de artista padrão, então nenhum é clicável (o vínculo é coberto nos testes unitários).
const collectiveId = (n: number) => `05000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const collectiveName = (n: number) => `Organização sintética ${n}`
const eventId = (n: number) => `0a000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const eventName = (n: number) => `Evento sintético ${n}`
const eventLink = (n: number) => `a[href="/eventos/${eventId(n)}"]`

let errors: string[]
test.beforeEach(({ page }) => {
  errors = []
  page.on('pageerror', (error) => errors.push(error.message))
})
test.afterEach(() => {
  expect(errors).toEqual([])
})

test('catálogo lista somente coletivos e produtoras aprovados', async ({ page }) => {
  const response = await page.goto('/coletivos')
  expect(response?.status()).toBe(200)
  expect(response?.headers()['cache-control']).toContain('no-store')
  await expect(page).toHaveTitle('Coletivos e Produtoras · CIRCUITO NE')
  await expect(page.getByRole('heading', { level: 1, name: 'coletivos/' })).toBeVisible()
  await expect(page.getByRole('heading', { level: 3, name: collectiveName(1), exact: true })).toBeVisible()

  const names = await page.locator('main li h3').allTextContents()
  expect(names).toEqual([collectiveName(1), collectiveName(6)])

  const producer = page.getByRole('heading', { level: 3, name: collectiveName(6), exact: true }).locator('xpath=ancestor::li')
  await expect(producer.getByText('Produtora', { exact: true })).toBeVisible()
  await expect(producer.getByText('Recife/PE')).toBeVisible()
  const collective = page.getByRole('heading', { level: 3, name: collectiveName(1), exact: true }).locator('xpath=ancestor::li')
  await expect(collective.getByText('Coletivo', { exact: true })).toBeVisible()
  await expect(collective.getByText('[Música]')).toBeVisible()
})

test('navega do catálogo ao perfil', async ({ page }) => {
  await page.goto('/coletivos')
  await page.getByRole('link', { name: new RegExp(collectiveName(1)) }).click()
  await expect(page).toHaveURL(new RegExp(`/coletivos/${collectiveId(1)}$`))
  await expect(page.getByRole('heading', { level: 1, name: collectiveName(1) })).toBeVisible()
  await page.getByRole('link', { name: '← coletivos/' }).click()
  await expect(page).toHaveURL(/\/coletivos$/)
})

test('perfil mostra nome, descrição, membros e eventos publicados separados em próximos e anteriores', async ({ page }) => {
  const response = await page.goto(`/coletivos/${collectiveId(1)}`)
  expect(response?.status()).toBe(200)
  expect(response?.headers()['cache-control']).toContain('no-store')
  await expect(page).toHaveTitle(`${collectiveName(1)} · CIRCUITO NE`)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(collectiveName(1))
  await expect(page.getByText('Fixture sem dados reais')).toBeVisible()
  await expect(page.getByText('Recife/PE')).toBeVisible()

  const members = page.locator('section', { has: page.getByRole('heading', { name: /^membros \(/ }) })
  await expect(members.getByRole('heading', { name: 'membros (2)' })).toBeVisible()
  await expect(members.getByText('Membro sintético ativo')).toBeVisible()
  await expect(members.getByText('Pessoa sintética ativa')).toBeVisible()
  await expect(members.getByRole('link')).toHaveCount(0)

  const upcoming = page.locator('section', { has: page.getByRole('heading', { name: 'próximos eventos' }) })
  for (const n of [1, 2, 6]) await expect(upcoming.locator(eventLink(n))).toBeVisible()
  for (const n of [3, 4, 5, 7]) await expect(upcoming.locator(eventLink(n))).toHaveCount(0)
  const past = page.locator('section', { has: page.getByRole('heading', { name: 'eventos anteriores' }) })
  await expect(past.locator(eventLink(3))).toBeVisible()
  for (const n of [1, 2, 4, 5, 6, 7]) await expect(past.locator(eventLink(n))).toHaveCount(0)
  // Nenhum evento cancelado, rascunho ou de outro coletivo aparece em lugar algum.
  for (const n of [4, 5, 7]) await expect(page.locator(eventLink(n))).toHaveCount(0)

  await upcoming.locator(eventLink(1)).click()
  await expect(page).toHaveURL(new RegExp(`/eventos/${eventId(1)}$`))
  await expect(page.getByRole('heading', { level: 1, name: eventName(1) })).toBeVisible()
})

test('perfil de produtora sem eventos mostra o estado vazio', async ({ page }) => {
  const response = await page.goto(`/coletivos/${collectiveId(6)}`)
  expect(response?.status()).toBe(200)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(collectiveName(6))
  await expect(page.getByText('Produtora', { exact: true })).toBeVisible()
  await expect(page.getByText('Sem eventos agendados.')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'eventos anteriores' })).toHaveCount(0)
})

for (const [label, id] of [
  ['pendente', collectiveId(2)],
  ['suspenso', collectiveId(3)],
  ['rejeitado', collectiveId(4)],
  ['encerrado', collectiveId(5)],
  ['id inexistente', collectiveId(99)],
  ['id que não é UUID', 'col-litoral'],
] as const) {
  test(`coletivo indisponível (${label}) responde 404 com estado "não encontrado"`, async ({ page }) => {
    const response = await page.goto(`/coletivos/${id}`)
    expect(response?.status()).toBe(404)
    await expect(page).toHaveTitle('Coletivo não encontrado · CIRCUITO NE')
    await expect(page.getByText('Coletivo não encontrado.')).toBeVisible()
    await page.getByRole('link', { name: 'Voltar', exact: true }).click()
    await expect(page).toHaveURL(/\/coletivos$/)
    await expect(page.getByRole('heading', { level: 1, name: 'coletivos/' })).toBeVisible()
  })
}
