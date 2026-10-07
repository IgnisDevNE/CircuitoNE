import { expect, test } from '@playwright/test'
import { rpcAs } from './rpc'
import { accounts, login, openPublicMenu, publicNav } from './session'

// W13. Somente leitura (roda em desktop e mobile): ordem da home, cidade/UF no card do artista, filtros do hub de artistas,
// vertente principal dos eventos (seeds: evento 1 techno, 2 house, 6 dubstep), /manifesto e favicon. A criação de evento com a
// vertente obrigatória pela interface está em events-manage.spec.ts (que escreve) e, pelo RPC, aqui só com recusas (nada é gravado).
const collectiveId = '05000000-0000-4000-8000-000000000001'
const eventId = (n: number) => `0a000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const eventName = (n: number) => `Evento sintético ${n}`
const publicArtist = 'Artista sintético público'
const NORDESTE = ['AL', 'BA', 'CE', 'MA', 'PB', 'PE', 'PI', 'RN', 'SE']

let errors: string[]
test.beforeEach(({ page }) => {
  errors = []
  page.on('pageerror', (error) => errors.push(error.message))
})
test.afterEach(() => {
  expect(errors).toEqual([])
})

test('home: eventos por último, depois de artistas e coletivos; card do artista traz cidade/UF', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('main h2')).toHaveText([/artistas\//, /coletivos\//, /eventos\.log/])
  const card = page.getByRole('link', { name: new RegExp(publicArtist) })
  await expect(card.getByText('Recife/PE', { exact: true })).toBeVisible()
  // A linha de cidade fica depois da linha de estilos, no mesmo card.
  await expect(card.getByText('techno', { exact: true })).toBeVisible()
})

test('home: card de evento mostra a vertente principal', async ({ page }) => {
  await page.goto('/')
  const card = page.getByRole('link', { name: new RegExp(eventName(2)) })
  await expect(card.getByText('house', { exact: true })).toBeVisible()
})

test('artistas: chips de UF com os 9 estados do Nordeste, filtro por UF combinável com estilo e busca', async ({ page }) => {
  await page.goto('/artistas')
  const estados = page.getByRole('group', { name: 'Filtrar por estado' })
  await expect(estados.getByRole('button')).toHaveText(['todos', ...NORDESTE])
  await expect(page.getByRole('article')).toHaveCount(1)

  await estados.getByRole('button', { name: 'CE', exact: true }).click()
  await expect(estados.getByRole('button', { name: 'CE', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByRole('article')).toHaveCount(0)
  await expect(page.getByText('Nenhum artista encontrado para os filtros atuais.')).toBeVisible()

  await estados.getByRole('button', { name: 'PE', exact: true }).click()
  await expect(page.getByRole('article')).toHaveCount(1)

  // Combina com estilo e busca.
  await page.getByRole('group', { name: 'Filtrar por estilo' }).getByRole('button', { name: 'techno', exact: true }).click()
  await expect(page.getByRole('article')).toHaveCount(1)
  await page.getByRole('searchbox', { name: 'Buscar', exact: true }).fill('inexistente')
  await expect(page.getByRole('article')).toHaveCount(0)
  await page.getByRole('searchbox', { name: 'Buscar', exact: true }).fill('')
  await estados.getByRole('button', { name: 'todos', exact: true }).click()
  await expect(page.getByRole('article')).toHaveCount(1)
})

test('artistas: o filtro de estilo oferece só estilos principais (nenhum subestilo)', async ({ page, request }) => {
  const { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } = process.env
  const headers = { apikey: SUPABASE_PUBLISHABLE_KEY! }
  const styles = ((await (await request.get(`${SUPABASE_URL}/rest/v1/music_styles?select=name`, { headers })).json()) as { name: string }[]).map((row) => row.name)
  const substyles = ((await (await request.get(`${SUPABASE_URL}/rest/v1/music_substyles?select=name`, { headers })).json()) as { name: string }[]).map((row) => row.name)
  expect(styles.length).toBeGreaterThan(40)
  expect(substyles).toContain('hypnotic techno')

  await page.goto('/artistas')
  const chips = await page.getByRole('group', { name: 'Filtrar por estilo' }).getByRole('button').allTextContents()
  expect(chips[0]).toBe('todos')
  expect(chips.length).toBeGreaterThan(1)
  for (const chip of chips.slice(1)) {
    expect(styles, chip).toContain(chip)
    expect(substyles.filter((name) => !styles.includes(name)), chip).not.toContain(chip)
  }
})

test('agenda e página do evento mostram a vertente principal', async ({ page }) => {
  await page.goto('/eventos')
  const card = (n: number) => page.getByRole('heading', { level: 3, name: eventName(n), exact: true }).locator('xpath=ancestor::li[1]')
  await expect(card(1).getByText('techno', { exact: true })).toBeVisible()
  await expect(card(6).getByText('dubstep', { exact: true })).toBeVisible()

  await page.goto(`/eventos/${eventId(2)}`)
  await expect(page.getByRole('heading', { level: 1, name: eventName(2) })).toBeVisible()
  await expect(page.getByText('house', { exact: true })).toBeVisible()
})

test('lista de eventos do artista traz a vertente do evento', async ({ page }) => {
  await page.goto('/artistas/02000000-0000-4000-8000-000000000001')
  const link = page.getByRole('link', { name: new RegExp(eventName(1)) })
  await expect(link.getByText('techno', { exact: true })).toBeVisible()
})

test('lista de eventos do coletivo traz a vertente do evento', async ({ page }) => {
  await page.goto(`/coletivos/${collectiveId}`)
  const link = page.getByRole('link', { name: new RegExp(eventName(1)) })
  await expect(link.getByText('techno', { exact: true })).toBeVisible()
})

test('criar evento exige a vertente principal: o formulário oferece só vertentes principais e o RPC recusa sem ela', async ({ page }) => {
  await login(page, accounts.active.email)
  await page.goto(`/coletivo/${collectiveId}/eventos/novo`)
  const select = page.getByLabel(/Vertente principal/)
  await expect(select).toHaveValue('')
  const options = await select.locator('option').allTextContents()
  expect(options[0]).toMatch(/escolher vertente/)
  expect(options).toContain('techno')
  expect(options).not.toContain('hypnotic techno')

  await page.getByRole('button', { name: 'salvar rascunho' }).click()
  await expect(page.getByText('[erro] Escolha a vertente principal do evento.')).toBeVisible()

  // O banco é a autoridade: sem vertente (ou com uma inexistente) nada é criado.
  const payload = { name: 'Sem vertente', kind: 'festa', starts_at: '2031-07-01T20:00:00-03:00', city: 'Recife', state_code: 'PE', venue: 'Pátio', is_free: true }
  await expect(rpcAs(accounts.active.email, 'create_event', { collective: collectiveId, payload, request_id: crypto.randomUUID() })).rejects.toThrow('Vertente principal obrigatória')
  await expect(rpcAs(accounts.active.email, 'create_event', { collective: collectiveId, payload: { ...payload, style: 'hypnotic techno' }, request_id: crypto.randomUUID() })).rejects.toThrow('Vertente principal inválida')
})

test('/manifesto: página pública com título, h1 e "Em breve", e link no menu depois de Eventos', async ({ page }) => {
  const response = await page.goto('/manifesto')
  expect(response?.status()).toBe(200)
  await expect(page).toHaveTitle('Manifesto · CIRCUITO NE')
  await expect(page.locator('meta[name="description"]')).toHaveAttribute('content', /manifesto/i)
  await expect(page.getByRole('heading', { level: 1 })).toContainText('manifesto')
  await expect(page.getByText('Em breve', { exact: true })).toBeVisible()
  await openPublicMenu(page)
  const links = publicNav(page).getByRole('link')
  await expect(links).toHaveText(['Artistas', 'Coletivos', 'Eventos', 'Manifesto', 'Entrar'])
  await expect(links.nth(3)).toHaveAttribute('href', '/manifesto')
  // Do início ao manifesto pelo menu.
  await page.goto('/')
  await openPublicMenu(page)
  await publicNav(page).getByRole('link', { name: 'Manifesto', exact: true }).click()
  await expect(page).toHaveURL(/\/manifesto$/)
})

test('favicon: /favicon.ico e /favicon.svg respondem e o HTML os declara', async ({ page, request }) => {
  for (const [path, type] of [['/favicon.ico', /icon/], ['/favicon.svg', /svg/]] as const) {
    const response = await request.get(path)
    expect(response.status(), path).toBe(200)
    expect(response.headers()['content-type'], path).toMatch(type)
  }
  await page.goto('/')
  await expect(page.locator('link[rel="icon"][href="/favicon.svg"]')).toHaveAttribute('type', 'image/svg+xml')
  await expect(page.locator('link[rel="icon"][href="/favicon.ico"]')).toHaveCount(1)
})
