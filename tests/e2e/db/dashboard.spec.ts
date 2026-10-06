import { expect, test } from '@playwright/test'
import { accounts, login, openPanelMenu, panelNav } from './session'

// Fixtures (identity.sql, collectives.sql, events.sql, messages.sql; o CI não carrega demo.sql):
//  fixture-active: atuações "Artista sintético público" (publicada), "Projeto sintético interno" (artista não publicada),
//    "Serviços sintéticos" e "Estúdio sintético"; dona e membro dos coletivos 1 (aprovado), 2 (pendente), 3 (suspenso),
//    4 (rejeitado) e 6 (produtora aprovada); o 5 está encerrado e some da lista. Está na line-up dos eventos 1, 2, 6
//    (e 8, conforme o horário); 3 passado, 4 cancelado, 5 rascunho e 7 de coletivo suspenso nunca aparecem.
//    Mensagens: a conversa 5 tem 1 mensagem do membro ainda não lida por ela.
//  fixture-member: artista não publicada "Artista sintético do membro", integrante "Interlocutor sintético" e membro (cargo "Operações sintéticas") do coletivo 1.
const collectiveId = (n: number) => `05000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const collectiveName = (n: number) => `Organização sintética ${n}`
const eventId = (n: number) => `0a000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const eventName = (n: number) => `Evento sintético ${n}`
const publicArtistId = '02000000-0000-4000-8000-000000000001'

let errors: string[]
test.beforeEach(({ page }) => {
  errors = []
  page.on('pageerror', (error) => errors.push(error.message))
})
test.afterEach(() => {
  expect(errors).toEqual([])
})

const section = (page: import('@playwright/test').Page, title: string) =>
  page.getByRole('heading', { level: 2, name: title }).locator('xpath=ancestor::section')

test('dashboard mostra as atuações reais da conta, com a situação de publicação', async ({ page }) => {
  await login(page, accounts.active.email)
  const list = page.getByText('atuações ativas').locator('xpath=following-sibling::ul')
  await expect(list.getByRole('listitem')).toHaveCount(4)
  const item = (name: string) => list.getByRole('listitem').filter({ hasText: name })
  await expect(item('Artista sintético público')).toContainText('Artista')
  await expect(item('Artista sintético público')).toContainText('perfil público')
  await expect(item('Projeto sintético interno')).toContainText('não publicado')
  await expect(item('Serviços sintéticos')).toContainText('Serviços')
  await expect(item('Estúdio sintético')).toContainText('Audiovisual')
  // Nada do protótipo (Ana Ribeiro, ANERIE etc.).
  for (const mock of ['Ana Ribeiro', 'ANERIE', 'LITORAL SUL']) await expect(page.getByText(mock)).toHaveCount(0)
})

test('dashboard lista os coletivos da conta com o cargo e a situação, sem os encerrados', async ({ page }) => {
  await login(page, accounts.active.email)
  const mine = section(page, 'meus coletivos')
  const names = await mine.locator('li').evaluateAll((items) => items.map((li) => li.querySelector('a, span')?.textContent))
  expect(names).toEqual([1, 2, 3, 4, 6].map(collectiveName))
  await expect(mine.getByRole('link', { name: collectiveName(1) })).toHaveAttribute('href', `/coletivo/${collectiveId(1)}/painel`)
  await expect(mine.getByRole('link', { name: collectiveName(6) })).toHaveAttribute('href', `/coletivo/${collectiveId(6)}/painel`)
  // Coletivos que ainda não estão aprovados aparecem com a situação, sem link para o painel.
  for (const [n, situacao] of [[2, 'em análise'], [3, 'suspenso'], [4, 'recusado']] as const) {
    const row = mine.locator('li').filter({ hasText: collectiveName(n) })
    await expect(row).toContainText(situacao)
    await expect(row.getByRole('link')).toHaveCount(0)
  }
  await expect(mine.locator('li').filter({ hasText: collectiveName(1) })).toContainText('Membro · responsável')
  await expect(mine.getByText(collectiveName(5))).toHaveCount(0)
})

test('dashboard mostra os próximos eventos com a atuação na line-up, em andamento primeiro', async ({ page }) => {
  await login(page, accounts.active.email)
  const events = section(page, 'próximos eventos')
  const titles = await events.locator('li a span.font-display').allTextContents()
  for (const n of [1, 2, 6]) expect(titles).toContain(eventName(n))
  for (const n of [3, 4, 5, 7]) expect(titles).not.toContain(eventName(n))
  expect(titles.indexOf(eventName(2))).toBeLessThan(titles.indexOf(eventName(1)))
  expect(titles.indexOf(eventName(1))).toBeLessThan(titles.indexOf(eventName(6)))
  const first = events.getByRole('link', { name: new RegExp(eventName(1)) })
  await expect(first).toHaveAttribute('href', `/eventos/${eventId(1)}`)
  await expect(first).toContainText('como Artista sintético público')
  await first.click()
  await expect(page).toHaveURL(new RegExp(`/eventos/${eventId(1)}$`))
  await expect(page.getByRole('heading', { level: 1, name: eventName(1) })).toBeVisible()
})

test('dashboard e menu mostram as mensagens não lidas', async ({ page }) => {
  await login(page, accounts.active.email)
  await expect(page.getByRole('status')).toHaveText('1 mensagem não lida.')
  await openPanelMenu(page)
  await expect(panelNav(page).getByRole('link', { name: 'Mensagens (1)' })).toHaveAttribute('href', '/painel/mensagens')
})

test('menu leva às páginas reais e às ainda em preparação, sem dados de mentira', async ({ page }) => {
  await login(page, accounts.active.email)
  await openPanelMenu(page)
  const nav = panelNav(page)
  for (const label of [
    'Início (site)', 'Dashboard', `Perfil · Artista sintético público`, 'Perfil · Projeto sintético interno',
    'Editar Dados', 'Segurança', 'Mensagens (1)', 'Coletivos/Produtoras',
    'Explorar Artistas', 'Explorar Serviços', 'Explorar Audiovisual', 'Explorar Coletivos',
  ]) await expect(nav.getByRole('link', { name: label })).toBeVisible()
  await expect(nav.getByRole('link', { name: `Perfil · Serviços sintéticos` })).toHaveCount(0)

  await nav.getByRole('link', { name: 'Explorar Artistas' }).click()
  await expect(page).toHaveURL(/\/painel\/explorar\/artistas$/)
  // O catálogo interno é real (explore.spec.ts).
  await expect(page).toHaveTitle('explorar/artistas · CIRCUITO NE')
  await expect(page.getByRole('heading', { level: 1, name: /explorar\/artistas/ })).toBeVisible()

  // A nova atuação é real (register.spec.ts): nada mais no menu é "Em breve".
  await page.goto('/painel/dados/nova-atuacao')
  await expect(page).toHaveTitle('Nova atuação · CIRCUITO NE')

  // O painel e as seções do coletivo são reais (collective.spec.ts e collective-manage.spec.ts).
  const response = await page.goto(`/coletivo/${collectiveId(1)}/membros`)
  expect(response?.status()).toBe(200)
  await expect(page.getByRole('heading', { level: 2, name: 'membros do coletivo' })).toBeVisible()
  await expect(panelNav(page).or(page.getByRole('button', { name: 'Menu do painel' }))).toBeVisible()
})

test('cada conta vê somente os próprios dados', async ({ page }) => {
  await login(page, accounts.member.email)
  const list = page.getByText('atuações ativas').locator('xpath=following-sibling::ul')
  await expect(list.getByRole('listitem')).toHaveCount(2)
  await expect(list).toContainText('Artista sintético do membro')
  await expect(list).toContainText('Interlocutor sintético')
  await expect(list).toContainText('não publicado')
  const mine = section(page, 'meus coletivos')
  await expect(mine.locator('li')).toHaveCount(1)
  await expect(mine).toContainText(collectiveName(1))
  await expect(mine).toContainText('Operações sintéticas')
  await expect(mine).not.toContainText('responsável')
  await expect(page.getByText('Artista sintético público')).toHaveCount(0)
  await expect(page.getByText('Projeto sintético interno')).toHaveCount(0)
  // O catálogo interno é de toda conta ativa (RN-06); os dados restritos dependem do banco (explore.spec.ts).
  await openPanelMenu(page)
  await expect(panelNav(page).getByRole('link', { name: /Explorar/ })).toHaveCount(4)
  await expect(page.getByText(accounts.active.name)).toHaveCount(0)
})

test('o perfil público do artista da conta continua acessível sem login', async ({ page, context }) => {
  await login(page, accounts.active.email)
  await context.clearCookies()
  const response = await page.goto(`/artistas/${publicArtistId}`)
  expect(response?.status()).toBe(200)
  await expect(page.getByRole('heading', { level: 1, name: 'Artista sintético público' })).toBeVisible()
  await page.goto('/painel')
  await expect(page).toHaveURL(/\/entrar$/)
})
