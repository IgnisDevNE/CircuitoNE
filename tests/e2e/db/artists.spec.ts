import { expect, test } from '@playwright/test'

// Fixtures de supabase/seeds/identity.sql (artistas) e events.sql (line-ups):
//  02..01 artista publicado (Recife/PE, estilo techno)      02..02 artista NÃO publicado
//  02..03 serviços  02..04 audiovisual  02..06 integrante   (nunca públicos)
//  02..05 artista publicado de conta suspensa (invisível)
// Eventos com o artista 01 no line-up: 1 (+1 dia), 2 (em andamento), 6 (+3 dias, pago), 4 cancelado,
// 5 rascunho e 7 de coletivo suspenso (estes três não aparecem na agenda pública).
const profileId = (n: number) => `02000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const eventId = (n: number) => `0a000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const eventName = (n: number) => `Evento sintético ${n}`
const publicArtist = 'Artista sintético público'

let errors: string[]
test.beforeEach(({ page }) => {
  errors = []
  page.on('pageerror', (error) => errors.push(error.message))
})
test.afterEach(() => {
  expect(errors).toEqual([])
})

test('hub lista somente artistas publicados de contas ativas', async ({ page }) => {
  const response = await page.goto('/artistas')
  expect(response?.status()).toBe(200)
  expect(response?.headers()['cache-control']).toContain('no-store')
  await expect(page).toHaveTitle('Artistas · CIRCUITO NE')
  await expect(page.getByRole('heading', { level: 1, name: 'artistas/' })).toBeVisible()
  await expect(page.getByRole('article')).toHaveCount(1)
  const card = page.getByRole('article')
  await expect(card.getByRole('heading', { level: 3, name: publicArtist, exact: true })).toBeVisible()
  await expect(card.getByText('Recife/PE', { exact: true })).toBeVisible()
  await expect(card.getByText('#techno', { exact: true })).toBeVisible()
  for (const hidden of ['Projeto sintético interno', 'Serviços sintéticos', 'Estúdio sintético', 'Artista sintético suspenso', 'Integrante sintético em exclusão'])
    await expect(page.getByText(hidden)).toHaveCount(0)
  // Dados restritos nunca chegam ao HTML do visitante.
  expect(await response!.text()).not.toMatch(/booking|presskit|fee_cents|contact_email/i)
})

test('hub filtra por estilo e busca e leva ao perfil', async ({ page }) => {
  await page.goto('/artistas')
  const filtros = page.getByRole('group', { name: 'Filtrar por estilo' })
  await expect(filtros.getByRole('button')).toHaveText(['todos', 'techno'])
  await filtros.getByRole('button', { name: 'techno', exact: true }).click()
  await expect(page.getByRole('article')).toHaveCount(1)
  await page.getByRole('searchbox', { name: 'Buscar', exact: true }).fill('inexistente')
  await expect(page.getByText('Nenhum artista encontrado para os filtros atuais.')).toBeVisible()
  await page.getByRole('searchbox', { name: 'Buscar', exact: true }).fill('')
  await page.getByRole('link', { name: publicArtist, exact: true }).click()
  await expect(page).toHaveURL(new RegExp(`/artistas/${profileId(1)}$`))
  await expect(page.getByRole('heading', { level: 1, name: publicArtist })).toBeVisible()
})

test('perfil mostra nome, cidade, estilo e eventos do artista, sem dados de contato privados', async ({ page }) => {
  const response = await page.goto(`/artistas/${profileId(1)}`)
  expect(response?.status()).toBe(200)
  await expect(page).toHaveTitle(`${publicArtist} · CIRCUITO NE`)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(publicArtist)
  await expect(page.getByText('Recife/PE', { exact: true })).toBeVisible()
  await expect(page.getByText('techno', { exact: true })).toBeVisible()
  await expect(page.getByText('Fixture, sem dados reais', { exact: true })).toBeVisible()

  const proximos = page.getByRole('heading', { name: 'próximos eventos' }).locator('xpath=ancestor::section[1]')
  await expect(proximos.getByRole('link', { name: new RegExp(eventName(1)) })).toHaveAttribute('href', `/eventos/${eventId(1)}`)
  await expect(proximos.getByRole('link', { name: new RegExp(eventName(2)) })).toBeVisible()
  await expect(proximos.getByRole('link', { name: new RegExp(eventName(6)) })).toBeVisible()
  for (const n of [4, 5, 7]) await expect(page.getByText(eventName(n), { exact: true })).toHaveCount(0)

  expect(await response!.text()).not.toMatch(/booking|presskit|fee_cents|contact_email|mailto:/i)
  await expect(page.getByRole('heading', { name: 'galeria' })).toHaveCount(0)
})

test('do perfil, o evento abre o detalhe com o artista no line-up', async ({ page }) => {
  await page.goto(`/artistas/${profileId(1)}`)
  await page.getByRole('link', { name: new RegExp(eventName(1)) }).click()
  await expect(page).toHaveURL(new RegExp(`/eventos/${eventId(1)}$`))
  await expect(page.getByRole('link', { name: publicArtist, exact: true })).toHaveAttribute('href', `/artistas/${profileId(1)}`)
})

for (const [label, id] of [
  ['artista não publicado', profileId(2)],
  ['atuação de serviços', profileId(3)],
  ['conta suspensa', profileId(5)],
  ['integrante', profileId(6)],
  ['id inexistente', profileId(99)],
  ['id que não é UUID', 'art-anerie'],
] as const) {
  test(`perfil indisponível (${label}) responde 404 com estado "não encontrado"`, async ({ page }) => {
    const response = await page.goto(`/artistas/${id}`)
    expect(response?.status()).toBe(404)
    await expect(page).toHaveTitle('Artista não encontrado · CIRCUITO NE')
    await expect(page.getByText('Artista não encontrado.')).toBeVisible()
    await page.getByRole('link', { name: 'Voltar ao hub', exact: true }).click()
    await expect(page).toHaveURL(/\/artistas$/)
    await expect(page.getByRole('heading', { level: 1, name: 'artistas/' })).toBeVisible()
  })
}
