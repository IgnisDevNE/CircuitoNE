import { expect, test, type Page } from '@playwright/test'
import { rpcAs } from './rpc'
import { accounts, login } from './session'

// Eventos criados aqui usam datas distantes (2031) e nomes próprios; ficam no coletivo 1 (da fixture-active) e são
// cancelados ao final. Os testes mudam dados: rodam em série e só no projeto desktop.
const collectiveId = '05000000-0000-4000-8000-000000000001'
const artistId = '02000000-0000-4000-8000-000000000001'
const stamp = Date.now().toString(36)
const name = `Festa W8 ${stamp}`
const renamed = `Festa W8 renomeada ${stamp}`

let errors: string[]
test.beforeEach(({ page }) => {
  errors = []
  page.on('pageerror', (error) => errors.push(error.message))
})
test.afterEach(() => {
  expect(errors).toEqual([])
})

test.describe.configure({ mode: 'serial' })
test.beforeEach(({}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'os testes que mudam dados rodam uma vez só')
})

let eventId = ''
const managePath = () => `/coletivo/${collectiveId}/eventos/${eventId}`
const field = (page: Page, key: string) => page.locator(`[name="${key}"]`)
const agendaTitles = async (page: Page) => {
  await page.goto('/eventos')
  return page.locator('main li h3').allTextContents()
}

// Garante que nada fique publicado, qualquer que seja o ponto em que o teste parou.
test.afterAll(async ({}, testInfo) => {
  if (testInfo.project.name !== 'desktop' || !eventId) return
  try {
    const row = await rpcAs<{ state: string; version: number }>(accounts.active.email, 'get_event', { target: eventId })
    if (row.state !== 'cancelled') await rpcAs(accounts.active.email, 'cancel_event', { target: eventId, expected_version: row.version })
  } catch {
    // Limpeza de melhor esforço: o evento tem data distante e nome próprio.
  }
})

test('criar um rascunho com lineup vinculado e livre: aparece no dashboard como rascunho e não na agenda', async ({ page }) => {
  await login(page, accounts.active.email)
  await page.goto(`/coletivo/${collectiveId}/painel`)
  await page.getByRole('navigation', { name: 'Seções do coletivo' }).getByRole('link', { name: 'Criar Evento' }).click()
  await expect(page).toHaveURL(new RegExp(`/coletivo/${collectiveId}/eventos/novo$`))
  await expect(page).toHaveTitle('Organização sintética 1 · Criar Evento · CIRCUITO NE')

  // Validação por campo: nada chega ao banco.
  await page.getByRole('button', { name: 'salvar rascunho' }).click()
  await expect(page.getByRole('alert').first()).toHaveText('[erro] Corrija os campos destacados.')
  await expect(page.getByText('[erro] Informe o nome do evento.')).toBeVisible()
  await expect(page.getByText('[erro] Informe a data e a hora de início.')).toBeVisible()
  await expect(page.getByText('[erro] Informe a cidade.')).toBeVisible()
  await expect(page.getByText('[erro] Escolha a vertente principal do evento.')).toBeVisible()

  await field(page, 'name').fill(name)
  await field(page, 'style').selectOption('house')
  await field(page, 'starts_at').fill('2031-03-15T20:00')
  await field(page, 'ends_at').fill('2031-03-15T19:00')
  await field(page, 'city').fill('Recife')
  await field(page, 'venue').fill('Pátio sintético')
  await field(page, 'description').fill('Texto com **destaque** e <b>html bruto</b>.')
  await expect(page.getByLabel('Pré-visualização da descrição').locator('strong')).toHaveText('destaque')
  await page.getByRole('checkbox', { name: 'Evento gratuito' }).check()
  await page.getByRole('combobox', { name: 'Artista do hub', exact: true }).selectOption(artistId)
  await page.getByRole('textbox', { name: 'Nome livre', exact: true }).fill('Convidada W8 livre')
  await page.getByRole('button', { name: 'Adicionar nome livre ao lineup' }).click()
  await page.getByRole('button', { name: 'salvar rascunho' }).click()
  // Fim anterior ao início: recusado com o texto digitado preservado.
  await expect(page.getByText('[erro] O fim deve ser posterior ao início.')).toBeVisible()
  await expect(field(page, 'name')).toHaveValue(name)
  await field(page, 'ends_at').fill('2031-03-15T23:30')
  await page.getByRole('button', { name: 'salvar rascunho' }).click()

  await expect(page).toHaveURL(new RegExp(`/coletivo/${collectiveId}/eventos/[0-9a-f-]{36}$`))
  eventId = page.url().split('/').pop()!
  await expect(page.getByText(name, { exact: true }).first()).toBeVisible()
  await expect(page.getByText('rascunho', { exact: true })).toBeVisible()
  await expect(page.getByText('versão 1')).toBeVisible()
  await expect(field(page, 'starts_at')).toHaveValue('2031-03-15T20:00')
  await expect(field(page, 'ends_at')).toHaveValue('2031-03-15T23:30')
  await expect(field(page, 'style')).toHaveValue('house')
  await expect(page.getByRole('list', { name: 'Lineup do evento' }).getByRole('listitem')).toHaveText([/Artista sintético público/, /Convidada W8 livre/])
  await expect(page.getByRole('link', { name: /página pública/ })).toHaveCount(0)

  // Dashboard: rascunho listado, com link para a gestão; agenda pública: ausente; página pública: 404.
  await page.goto(`/coletivo/${collectiveId}/painel`)
  const item = page.getByRole('link', { name: new RegExp(name) })
  await expect(item).toContainText('rascunho')
  await expect(item).toHaveAttribute('href', managePath())
  expect(await agendaTitles(page)).not.toContain(name)
  const hidden = await page.goto(`/eventos/${eventId}`)
  expect(hidden?.status()).toBe(404)
})

test('publicar: o evento entra na agenda e ganha página pública com o lineup', async ({ page }) => {
  await login(page, accounts.active.email)
  await page.goto(managePath())
  await page.getByRole('button', { name: 'publicar evento' }).click()
  await expect(page.getByRole('status')).toHaveText('Evento publicado. Ele já aparece na agenda pública.')
  await expect(page.getByText('publicado', { exact: true })).toBeVisible()
  await expect(page.getByText('versão 2')).toBeVisible()
  await expect(page.getByRole('button', { name: 'publicar evento' })).toHaveCount(0)

  await page.getByRole('link', { name: 'ver página pública ↗' }).click()
  await expect(page).toHaveURL(new RegExp(`/eventos/${eventId}$`))
  await expect(page.getByRole('heading', { level: 1, name })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Artista sintético público', exact: true })).toHaveAttribute('href', `/artistas/${artistId}`)
  await expect(page.getByText('Convidada W8 livre')).toBeVisible()
  await expect(page.getByRole('link', { name: 'Convidada W8 livre' })).toHaveCount(0)
  await expect(page.locator('main strong')).toHaveText('destaque')
  await expect(page.getByText('Entrada gratuita — é só chegar!')).toBeVisible()
  await expect(page.locator('main b')).toHaveCount(0)
  await expect(page.getByText('house', { exact: true })).toBeVisible()
  expect(await agendaTitles(page)).toContain(name)
})

test('editar o nome atualiza a página pública; edição concorrente mostra o conflito e recarrega', async ({ page }) => {
  await login(page, accounts.active.email)
  await page.goto(managePath())
  await expect(page.getByText(/aparece na página pública imediatamente/)).toBeVisible()
  await field(page, 'name').fill(renamed)
  // A vertente principal também é editável depois de criado.
  await field(page, 'style').selectOption('trance')
  await page.getByRole('button', { name: 'salvar alterações' }).click()
  await expect(page.getByRole('status')).toHaveText('Alterações salvas.')
  await expect(page.getByText('versão 3')).toBeVisible()
  await expect(field(page, 'name')).toHaveValue(renamed)
  await expect(field(page, 'style')).toHaveValue('trance')
  await page.goto(`/eventos/${eventId}`)
  await expect(page.getByRole('heading', { level: 1, name: renamed })).toBeVisible()
  await expect(page.getByText('trance', { exact: true })).toBeVisible()
  await expect(page.getByText('house', { exact: true })).toHaveCount(0)

  // Outra pessoa (outro dispositivo) salva antes: este envio usa a versão antiga e é recusado.
  await page.goto(managePath())
  await field(page, 'city').fill('Olinda')
  const row = await rpcAs<{ version: number }>(accounts.active.email, 'get_event', { target: eventId })
  await rpcAs(accounts.active.email, 'update_event', { target: eventId, expected_version: row.version, payload: { venue: 'Outro pátio' } })
  await page.getByRole('button', { name: 'salvar alterações' }).click()
  await expect(page.getByRole('alert')).toContainText('alterado por outra pessoa')
  await expect(page.getByText(`versão ${row.version + 1}`)).toBeVisible()
  await expect(field(page, 'venue')).toHaveValue('Outro pátio')
  await expect(field(page, 'city')).toHaveValue('Recife')
})

test('cancelar exige confirmação e retira o evento da agenda, mantendo a página de aviso', async ({ page }) => {
  await login(page, accounts.active.email)
  await page.goto(managePath())
  await expect(page.getByRole('button', { name: 'confirmar cancelamento' })).toBeHidden()
  await page.getByText('cancelar evento', { exact: true }).click()
  await page.getByRole('button', { name: 'confirmar cancelamento' }).click()
  await expect(page.getByRole('status')).toHaveText('Evento cancelado.')
  await expect(page.getByText('Evento cancelado: não pode mais ser editado.')).toBeVisible()
  await expect(page.getByRole('button', { name: 'salvar alterações' })).toHaveCount(0)
  await expect(page.getByRole('link', { name: /página pública/ })).toHaveCount(0)

  expect(await agendaTitles(page)).not.toContain(renamed)
  const direct = await page.goto(`/eventos/${eventId}`)
  expect(direct?.status()).toBe(200)
  await expect(page.getByText('Cancelado', { exact: true })).toBeVisible()
  await page.goto(`/coletivo/${collectiveId}/painel`)
  await expect(page.getByRole('link', { name: new RegExp(renamed) })).toContainText('cancelado')
})

test('visitante vai para /entrar; evento de outro coletivo ou inexistente responde 404 na gestão', async ({ page, context }) => {
  await login(page, accounts.active.email)
  for (const id of ['0a000000-0000-4000-8000-000000000099', 'nao-e-uuid']) {
    const response = await page.goto(`/coletivo/${collectiveId}/eventos/${id}`)
    expect(response?.status(), id).toBe(404)
    await expect(page.getByText('Evento não encontrado.')).toBeVisible()
  }
  // Evento 7 pertence a outro coletivo (suspenso): nunca aparece pela gestão deste.
  const other = await page.goto(`/coletivo/${collectiveId}/eventos/0a000000-0000-4000-8000-000000000007`)
  expect(other?.status()).toBe(404)
  await context.clearCookies()
  await page.goto(managePath())
  await expect(page).toHaveURL(/\/entrar$/)
  await page.goto(`/coletivo/${collectiveId}/eventos/novo`)
  await expect(page).toHaveURL(/\/entrar$/)
})
