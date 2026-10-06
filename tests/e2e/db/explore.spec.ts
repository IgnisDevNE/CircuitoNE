import { expect, test, type Page } from '@playwright/test'
import { rpcAs } from './rpc'
import { accounts, login } from './session'
import { totp, totpWindow } from './totp'

// Catálogo interno (W9, RN-06/RN-07) contra o Supabase local. Roda no projeto `explore` do playwright.db.config.ts, depois das
// leituras e uma suíte por vez: prepara dados profissionais nas fixtures e usa MFA (TOTP) da fixture-active; tudo é desfeito.
// Fixtures: fixture-active é dona dos coletivos 1 (aprovado) e 6 (produtora aprovada); fixture-member é membro do coletivo 1 com um
// perfil de todas as permissões delegáveis (nunca o diretório restrito); fixture-applicant não pertence a nenhum coletivo.
const MEMBER_ARTIST = '02000000-0000-4000-8000-000000000008'
const ACTIVE_SERVICES = '02000000-0000-4000-8000-000000000003'
const COLLECTIVE_1 = '05000000-0000-4000-8000-000000000001'
const COLLECTIVE_6 = '05000000-0000-4000-8000-000000000006'
const BOOKING = 'booking-w9@example.invalid'
const PRESSKIT = 'https://presskit.example.invalid/w9'
const NOTICE = 'Disponível para proprietários de coletivos aprovados com verificação em duas etapas'

let errors: string[]
test.beforeEach(({ page }) => {
  errors = []
  page.on('pageerror', (error) => errors.push(error.message))
})
test.afterEach(() => {
  expect(errors).toEqual([])
})
test.describe.configure({ mode: 'serial' })

test.beforeAll(async () => {
  await rpcAs(accounts.member.email, 'update_my_professional_details', {
    target: MEMBER_ARTIST,
    payload: { booking_email: BOOKING, fee_cents: 250000, presskit_url: PRESSKIT },
  })
  await rpcAs(accounts.active.email, 'update_my_professional_details', { target: ACTIVE_SERVICES, payload: { service_type: 'sound' } })
})
test.afterAll(async () => {
  for (const [email, target, payload] of [
    [accounts.member.email, MEMBER_ARTIST, { booking_email: null, fee_cents: null, presskit_url: null }],
    [accounts.active.email, ACTIVE_SERVICES, { service_type: null }],
  ] as const) {
    try {
      await rpcAs(email, 'update_my_professional_details', { target, payload })
    } catch {
      // Limpeza de melhor esforço.
    }
  }
})

/** Os filtros rodam no cliente: espera a hidratação para não digitar antes de o React assumir o formulário. */
const hydrated = (page: Page, form = '[role=search]') =>
  expect
    .poll(() => page.locator(form).first().evaluate((form) => Object.keys(form).some((key) => key.startsWith('__reactFiber'))))
    .toBe(true)
const open = async (page: Page, path: string, form?: string) => {
  const response = await page.goto(path)
  await hydrated(page, form)
  return response
}
const names = (page: Page) => page.locator('main ul li h2').allTextContents()
const restricted = (page: Page) => page.getByLabel('Dados restritos')
const catalogNav = (page: Page) => page.getByRole('navigation', { name: 'Catálogo' })

test('conta comum: catálogo sem dados restritos, com aviso, busca e filtros; todos os tipos abrem', async ({ page }) => {
  await login(page, accounts.applicant.email)
  const response = await open(page, '/painel/explorar/artistas')
  expect(response?.status()).toBe(200)
  expect(response?.headers()['cache-control']).toContain('no-store')
  await expect(page).toHaveTitle('explorar/artistas · CIRCUITO NE')
  await expect(page.getByRole('heading', { level: 1 })).toContainText('explorar/artistas')

  // Projeção não restrita de todas as atuações ativas (inclusive não publicadas); conta suspensa e outros tipos ficam de fora.
  const listed = await names(page)
  expect(listed).toEqual(expect.arrayContaining(['Artista sintético público', 'Artista sintético do membro', 'Artista sintético do candidato']))
  expect(listed).not.toContain('Artista sintético suspenso')
  expect(listed).not.toContain('Serviços sintéticos')

  // Nada restrito: o banco não devolve; só a atuação da própria conta mostra o bloco (vazio).
  await expect(page.getByRole('note')).toContainText(NOTICE)
  await expect(page.getByRole('note').getByRole('link')).toHaveAttribute('href', '/painel/seguranca')
  await expect(page.getByText(BOOKING)).toHaveCount(0)
  await expect(page.getByText('R$ 2.500,00')).toHaveCount(0)
  await expect(page.getByRole('link', { name: /presskit/i })).toHaveCount(0)
  await expect(restricted(page)).toHaveCount(1)
  await expect(page.getByText('sua atuação')).toHaveCount(1)
  await expect(page.getByText('Sem dados profissionais cadastrados.')).toBeVisible()
  await expect(page.getByRole('link', { name: 'Enviar mensagem' }).first()).toHaveAttribute('href', /\/painel\/mensagens\/nova\?para=profile:/)

  // Busca (sem acento), estado e estilo.
  await page.getByRole('searchbox', { name: /Buscar/ }).fill('CANDIDATO')
  expect(await names(page)).toEqual(['Artista sintético do candidato'])
  await expect(page.getByRole('status')).toContainText(/^1 de \d+$/)
  await page.getByRole('searchbox', { name: /Buscar/ }).fill('')
  await page.getByRole('combobox', { name: /Estado/ }).selectOption('SP')
  await expect(page.getByText('Nenhuma atuação encontrada para os filtros atuais.')).toBeVisible()
  await page.getByRole('combobox', { name: /Estado/ }).selectOption('')
  await page.getByRole('combobox', { name: /Estilo/ }).selectOption('techno')
  const styled = await names(page)
  expect(styled).toContain('Artista sintético público')
  expect(styled).not.toContain('Artista sintético do membro')

  // Serviços e audiovisual: o tipo é restrito, então não há filtro de tipo para quem não o lê.
  await catalogNav(page).getByRole('link', { name: 'Serviços' }).click()
  await expect(page).toHaveURL(/\/painel\/explorar\/servicos$/)
  await hydrated(page)
  expect(await names(page)).toContain('Serviços sintéticos')
  await expect(page.getByRole('combobox', { name: /Tipo/ })).toHaveCount(0)
  await expect(page.getByRole('note')).toContainText(NOTICE)
  await catalogNav(page).getByRole('link', { name: 'Audiovisual' }).click()
  await expect(page).toHaveURL(/\/painel\/explorar\/audiovisual$/)
  await hydrated(page)
  expect(await names(page)).toContain('Estúdio sintético')

  // Coletivos: só os aprovados, com link para a página pública e mensagem; sem aviso de restrito.
  await catalogNav(page).getByRole('link', { name: 'Coletivos' }).click()
  await expect(page).toHaveURL(/\/painel\/explorar\/coletivos$/)
  await hydrated(page)
  const collectives = await names(page)
  expect(collectives).toEqual(expect.arrayContaining(['Organização sintética 1', 'Organização sintética 6']))
  for (const hidden of [2, 3, 4, 5]) expect(collectives).not.toContain(`Organização sintética ${hidden}`)
  await expect(page.getByRole('note')).toHaveCount(0)
  const card = page.locator('main ul li').filter({ hasText: 'Organização sintética 6' })
  await expect(card.getByRole('link', { name: 'ver perfil público →' })).toHaveAttribute('href', `/coletivos/${COLLECTIVE_6}`)
  await expect(card.getByRole('link', { name: 'Enviar mensagem' })).toHaveAttribute('href', `/painel/mensagens/nova?para=collective:${COLLECTIVE_6}`)
  await page.getByRole('combobox', { name: /Tipo/ }).selectOption('produtora')
  expect(await names(page)).toContain('Organização sintética 6')
  expect(await names(page)).not.toContain('Organização sintética 1')

  // Página inexistente do catálogo: 404.
  expect((await page.goto('/painel/explorar/admin'))?.status()).toBe(404)
})

test('membro com todas as permissões delegáveis não lê dados restritos de outras pessoas (RN-07)', async ({ page }) => {
  await login(page, accounts.member.email)
  await open(page, '/painel/explorar/artistas')
  expect(await names(page)).toEqual(expect.arrayContaining(['Artista sintético público', 'Artista sintético do membro']))
  await expect(page.getByRole('note')).toContainText(NOTICE)
  // Só os dados da própria atuação aparecem.
  await expect(restricted(page)).toHaveCount(1)
  const own = page.locator('main ul li').filter({ hasText: 'Artista sintético do membro' })
  await expect(own).toContainText('sua atuação')
  await expect(own.getByText(BOOKING)).toBeVisible()
  await expect(own.getByText('R$ 2.500,00')).toBeVisible()
  await expect(own.getByRole('link', { name: 'abrir presskit ↗' })).toHaveAttribute('href', PRESSKIT)
  await expect(page.locator('main ul li').filter({ hasText: 'Artista sintético público' }).getByLabel('Dados restritos')).toHaveCount(0)
})

test('proprietário de coletivo aprovado: com MFA (aal2) vê os dados restritos; sem ela, só o aviso', async ({ page }) => {
  test.setTimeout(180_000)
  await login(page, accounts.active.email)

  // Sem o segundo fator, a conta dona de coletivos aprovados também só vê o aviso.
  await open(page, '/painel/explorar/artistas')
  await expect(page.getByRole('note')).toContainText(NOTICE)
  await expect(page.getByText(BOOKING)).toHaveCount(0)

  await open(page, '/painel/seguranca', 'main form')
  await page.getByRole('button', { name: 'configurar aplicativo autenticador' }).click()
  const secretElement = page.getByTestId('mfa-secret')
  await expect(secretElement).toBeVisible()
  const secret = (await secretElement.textContent())!.trim()
  expect(secret).toMatch(/^[A-Z2-7]{16,}$/)

  let enabled = false
  try {
    await page.getByLabel(/Código do aplicativo/).fill(totp(secret))
    await page.getByRole('button', { name: 'ativar' }).click()
    enabled = true
    await expect(page.getByRole('status')).toHaveText('Autenticação em dois fatores ativada.')

    // A sessão que ativou o MFA já está no segundo nível: o banco passa a devolver as linhas profissionais de todos.
    await open(page, '/painel/explorar/artistas')
    await expect(page.getByRole('note')).toHaveCount(0)
    const member = page.locator('main ul li').filter({ hasText: 'Artista sintético do membro' })
    await expect(member.getByText(BOOKING)).toBeVisible()
    await expect(member.getByText('R$ 2.500,00')).toBeVisible()
    await expect(member.getByRole('link', { name: 'abrir presskit ↗' })).toHaveAttribute('href', PRESSKIT)
    expect(await restricted(page).count()).toBeGreaterThan(2)
    await expect(page.getByText('Sem dados profissionais cadastrados.').first()).toBeVisible()

    // O tipo de serviço também é restrito: agora há rótulo e filtro.
    await page.getByRole('navigation', { name: 'Catálogo' }).getByRole('link', { name: 'Serviços' }).click()
    await expect(page).toHaveURL(/\/painel\/explorar\/servicos$/)
    await hydrated(page)
    const services = page.locator('main ul li').filter({ hasText: 'Serviços sintéticos' })
    await expect(services).toContainText('Som')
    await page.getByRole('combobox', { name: /Tipo/ }).selectOption({ label: 'Som' })
    expect(await names(page)).toContain('Serviços sintéticos')
    await expect(page.getByRole('note')).toHaveCount(0)

    // Com aal2, a transferência de propriedade aparece; sem sucessor elegível (o membro não tem MFA) o banco recusa e nada muda.
    await open(page, `/coletivo/${COLLECTIVE_1}/editar`, 'main form')
    const transfer = page.getByRole('region', { name: 'Transferir a propriedade' })
    await expect(transfer.getByRole('link', { name: 'ir para Segurança' })).toHaveCount(0)
    await expect(transfer.getByRole('combobox', { name: /Novo proprietário/ })).toBeVisible()
    await transfer.getByRole('checkbox').check()
    await transfer.getByRole('button', { name: 'transferir propriedade' }).click()
    await expect(page.getByRole('alert')).toContainText('segundo fator')
    await expect(page).toHaveURL(new RegExp(`/coletivo/${COLLECTIVE_1}/editar$`))
    const roster = await rpcAs<{ user_id: string; is_owner: boolean }[]>(accounts.active.email, 'get_collective_member_roster', { target: COLLECTIVE_1 })
    expect(roster.find((row) => row.is_owner)?.user_id).toBe('01000000-0000-4000-8000-000000000001')
  } finally {
    if (enabled) {
      // O mesmo código não é reaproveitado: espera a próxima janela de 30 s para remover o fator.
      const window = totpWindow()
      await expect.poll(() => totpWindow(), { timeout: 40_000 }).toBeGreaterThan(window)
      await open(page, '/painel/seguranca', 'main form')
      await page.getByLabel(/Código para remover/).fill(totp(secret))
      await page.getByRole('button', { name: 'remover autenticação em dois fatores' }).click()
      await expect(page.getByRole('status')).toHaveText('Autenticação em dois fatores removida.')
    }
  }
})
