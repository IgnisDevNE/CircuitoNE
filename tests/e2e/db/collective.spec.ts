import { expect, test, type Page } from '@playwright/test'
import { rpcAs } from './rpc'
import { accounts, login, openPanelMenu, panelNav } from './session'

// Fixtures (identity.sql, collectives.sql, collective-area.sql, events.sql, messages.sql; o CI não carrega demo.sql):
//  fixture-active é dona dos coletivos 1 (aprovado), 2 (pendente), 3 (suspenso), 4 (rejeitado) e 6 (produtora aprovada); o 5 está encerrado.
//  fixture-member é membro do coletivo 1 com o perfil "Operações sintéticas" (as oito permissões, nunca as do proprietário)
//    e tem um pedido pendente para o coletivo 6 (que ninguém decide aqui: dashboard.spec afirma os coletivos dessa conta).
//  fixture-applicant não pertence a nenhum coletivo: só ela pede, cancela, entra e sai; os testes que mudam dados a restauram.
// Eventos do coletivo 1: 2 (em andamento), 1 e 4 (+1 dia; o 4 cancelado), 5 (rascunho), 6 (+3 dias), 3 (passado) e 8 (depende do horário).
const collectiveId = (n: number) => `05000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const collectiveName = (n: number) => `Organização sintética ${n}`
const eventId = (n: number) => `0a000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const eventName = (n: number) => `Evento sintético ${n}`
const applicantId = '01000000-0000-4000-8000-000000000006'

let errors: string[]
test.beforeEach(({ page }) => {
  errors = []
  page.on('pageerror', (error) => errors.push(error.message))
})
test.afterEach(() => {
  expect(errors).toEqual([])
})

const sectionNav = (page: Page) => page.getByRole('navigation', { name: 'Seções do coletivo' })
const sectionLabels = (page: Page) => sectionNav(page).getByRole('link').allTextContents()
const panel = (page: Page, title: string) => page.getByRole('heading', { level: 2, name: title, exact: true }).locator('xpath=ancestor::section')

async function logout(page: Page, context: import('@playwright/test').BrowserContext) {
  await context.clearCookies()
  await page.goto('/entrar')
}

test.describe('acesso por permissões', () => {
  test('a proprietária vê todas as seções, os eventos de gestão e os pedidos pendentes', async ({ page }) => {
    await login(page, accounts.active.email)
    const response = await page.goto(`/coletivo/${collectiveId(1)}/painel`)
    expect(response?.status()).toBe(200)
    expect(response?.headers()['cache-control']).toContain('no-store')
    await expect(page).toHaveTitle(`${collectiveName(1)} · Dashboard · CIRCUITO NE`)
    await expect(page.getByRole('heading', { level: 1, name: collectiveName(1) })).toBeVisible()
    await expect(page.getByText('Membro · responsável')).toBeVisible()
    expect(await sectionLabels(page)).toEqual(['Dashboard', 'Mensagens', 'Solicitações', 'Criar Evento', 'Membros', 'Editar', 'Perfil Público'])
    await expect(sectionNav(page).getByRole('link', { name: 'Editar' })).toHaveAttribute('href', `/coletivo/${collectiveId(1)}/editar`)

    // Rascunho e cancelado só aparecem na gestão; evento de outro coletivo (7) nunca.
    const events = panel(page, 'eventos')
    const hrefs = await events.locator('a').evaluateAll((items) => items.map((a) => a.getAttribute('href')))
    const position = (n: number) => hrefs.indexOf(`/coletivo/${collectiveId(1)}/eventos/${eventId(n)}`)
    for (const n of [1, 2, 3, 4, 5, 6]) expect(position(n), eventName(n)).toBeGreaterThanOrEqual(0)
    expect(position(7)).toBe(-1)
    // Em andamento, depois futuros por proximidade, depois encerrados.
    expect([2, 1, 4, 5, 6, 3].map(position)).toEqual([2, 1, 4, 5, 6, 3].map(position).sort((a, b) => a - b))
    await expect(events.getByRole('link', { name: new RegExp(eventName(2)) })).toContainText('em andamento')
    await expect(events.getByRole('link', { name: new RegExp(eventName(4)) })).toContainText('cancelado')
    await expect(events.getByRole('link', { name: new RegExp(eventName(5)) })).toContainText('rascunho')
    await expect(events.getByRole('link', { name: new RegExp(eventName(3)) })).toContainText('encerrado')
    await expect(events.getByText('Seu perfil não gere eventos')).toHaveCount(0)

    await expect(panel(page, 'solicitações de entrada').getByRole('status')).toHaveText('Nenhum pedido pendente.')
    await expect(panel(page, 'mensagens do coletivo')).toContainText(/em 1 conversa\./)
    const shortcuts = panel(page, 'atalhos')
    await expect(shortcuts.getByRole('link', { name: 'Ver perfil público ↗' })).toHaveAttribute('href', `/coletivos/${collectiveId(1)}`)
    expect(errors).toEqual([])
  })

  test('o membro com perfil de operações vê as seções delegáveis, nunca as exclusivas do proprietário', async ({ page }) => {
    await login(page, accounts.member.email)
    await page.goto(`/coletivo/${collectiveId(1)}/painel`)
    await expect(page.getByRole('heading', { level: 1, name: collectiveName(1) })).toBeVisible()
    await expect(page.getByText('Operações sintéticas', { exact: true })).toBeVisible()
    await expect(page.getByText('responsável')).toHaveCount(0)
    expect(await sectionLabels(page)).toEqual(['Dashboard', 'Mensagens', 'Solicitações', 'Criar Evento', 'Membros'])
    // Tem permissão de eventos: vê a gestão (rascunho incluso).
    await expect(panel(page, 'eventos').getByRole('link', { name: new RegExp(eventName(5)) })).toContainText('rascunho')
    await expect(panel(page, 'solicitações de entrada')).toBeVisible()

    await sectionNav(page).getByRole('link', { name: 'Solicitações' }).click()
    await expect(page).toHaveURL(new RegExp(`/coletivo/${collectiveId(1)}/solicitacoes$`))
    await expect(page).toHaveTitle(`${collectiveName(1)} · Solicitações · CIRCUITO NE`)
    await expect(page.getByText('Nenhuma solicitação de acesso pendente.')).toBeVisible()
  })

  test('seções de gestão abrem dentro do layout do coletivo, com o menu por permissões', async ({ page }) => {
    await login(page, accounts.active.email)
    for (const [path, panelTitle] of [['membros', 'membros do coletivo'], ['editar', 'informações'], ['perfil', 'perfil público do coletivo']]) {
      const response = await page.goto(`/coletivo/${collectiveId(1)}/${path}`)
      expect(response?.status()).toBe(200)
      await expect(page.getByRole('heading', { level: 2, name: panelTitle, exact: true })).toBeVisible()
      await expect(page.getByRole('heading', { level: 1, name: collectiveName(1) })).toBeVisible()
      await expect(sectionNav(page)).toBeVisible()
    }
    await page.goto(`/coletivo/${collectiveId(1)}/painel`)
    await sectionNav(page).getByRole('link', { name: 'Membros' }).click()
    await expect(page).toHaveURL(new RegExp(`/coletivo/${collectiveId(1)}/membros$`))
    await expect(page).toHaveTitle(`${collectiveName(1)} · Membros · CIRCUITO NE`)
  })

  test('quem não é membro recebe o mesmo 404 de um coletivo que não existe', async ({ page }) => {
    await login(page, accounts.member.email)
    // Coletivo 6 existe e está aprovado, mas esta conta só tem um pedido pendente, não vínculo.
    for (const id of [collectiveId(6), collectiveId(2), collectiveId(5), collectiveId(99), 'col-litoral']) {
      const response = await page.goto(`/coletivo/${id}/painel`)
      expect(response?.status(), id).toBe(404)
      await expect(page.getByText('Coletivo não encontrado.')).toBeVisible()
      await expect(page.getByRole('link', { name: 'voltar para meus coletivos' })).toHaveAttribute('href', '/painel/coletivos')
      await expect(page.getByRole('navigation', { name: 'Seções do coletivo' })).toHaveCount(0)
    }
    const other = await page.goto(`/coletivo/${collectiveId(6)}/solicitacoes`)
    expect(other?.status()).toBe(404)
  })

  test('coletivo encerrado nem para o antigo proprietário, e visitante vai para /entrar', async ({ page, context }) => {
    await login(page, accounts.active.email)
    const closed = await page.goto(`/coletivo/${collectiveId(5)}/painel`)
    expect(closed?.status()).toBe(404)
    await context.clearCookies()
    await page.goto(`/coletivo/${collectiveId(1)}/painel`)
    await expect(page).toHaveURL(/\/entrar$/)
    await page.goto(`/coletivo/${collectiveId(1)}/solicitacoes`)
    await expect(page).toHaveURL(/\/entrar$/)
  })

  for (const [n, label, text] of [
    [2, 'em análise', /somente depois da aprovação/],
    [3, 'suspenso', /ficam indisponíveis até uma eventual reativação/],
    [4, 'recusado', /recusou este cadastro/],
  ] as const) {
    test(`coletivo ${label}: só o estado, sem funções internas (RN-30)`, async ({ page }) => {
      await login(page, accounts.active.email)
      for (const path of ['painel', 'solicitacoes', 'eventos/novo']) {
        await page.goto(`/coletivo/${collectiveId(n)}/${path}`)
        await expect(page.getByRole('heading', { level: 1, name: collectiveName(n) })).toBeVisible()
        await expect(page.getByText(label, { exact: true })).toBeVisible()
        await expect(page.getByRole('status')).toContainText(text)
        await expect(sectionNav(page)).toHaveCount(0)
        await expect(page.getByText('solicitações pendentes')).toHaveCount(0)
      }
      await page.getByRole('link', { name: 'voltar para meus coletivos' }).click()
      await expect(page).toHaveURL(/\/painel\/coletivos$/)
    })
  }
})

test.describe('meus coletivos e pedidos', () => {
  test('a proprietária vê os próprios coletivos, com a situação de cada um', async ({ page }) => {
    await login(page, accounts.active.email)
    await openPanelMenu(page)
    await panelNav(page).getByRole('link', { name: 'Coletivos/Produtoras' }).click()
    await expect(page).toHaveURL(/\/painel\/coletivos$/)
    await expect(page).toHaveTitle('Meus Coletivos · CIRCUITO NE')
    const cards = page.getByRole('list', { name: 'Meus coletivos' }).getByRole('listitem')
    const names = await cards.getByRole('heading', { level: 3 }).allTextContents()
    expect(names).toEqual([1, 2, 3, 4, 6].map(collectiveName))
    const card = (n: number) => cards.filter({ hasText: collectiveName(n) })
    await expect(card(1).getByRole('link', { name: 'abrir dashboard →' })).toHaveAttribute('href', `/coletivo/${collectiveId(1)}/painel`)
    await expect(card(6).getByRole('link', { name: 'abrir dashboard →' })).toHaveAttribute('href', `/coletivo/${collectiveId(6)}/painel`)
    for (const [n, situacao] of [[2, 'em análise'], [3, 'suspenso'], [4, 'recusado']] as const) {
      await expect(card(n)).toContainText(situacao)
      await expect(card(n).getByRole('link', { name: 'ver situação →' })).toHaveAttribute('href', `/coletivo/${collectiveId(n)}/painel`)
      await expect(card(n).getByRole('link', { name: 'perfil público' })).toHaveCount(0)
    }
    await expect(card(1).getByRole('link', { name: 'perfil público' })).toHaveAttribute('href', `/coletivos/${collectiveId(1)}`)
    await expect(page.getByText(collectiveName(5))).toHaveCount(0)
    await card(6).getByRole('link', { name: 'abrir dashboard →' }).click()
    await expect(page).toHaveURL(new RegExp(`/coletivo/${collectiveId(6)}/painel$`))
    await expect(page.getByRole('heading', { level: 1, name: collectiveName(6) })).toBeVisible()
  })

  test('o membro vê seu vínculo, o pedido pendente para outro coletivo e nenhuma opção repetida', async ({ page }) => {
    await login(page, accounts.member.email)
    await page.goto('/painel/coletivos')
    const cards = page.getByRole('list', { name: 'Meus coletivos' }).getByRole('listitem')
    await expect(cards).toHaveCount(1)
    await expect(cards).toContainText(collectiveName(1))
    await expect(cards).toContainText('Operações sintéticas')
    await expect(cards).not.toContainText('responsável')

    const requests = panel(page, 'meus pedidos de entrada')
    const pending = requests.getByRole('listitem').filter({ hasText: collectiveName(6) })
    await expect(pending).toContainText('pendente')
    await expect(pending.getByRole('button', { name: `Cancelar pedido para ${collectiveName(6)}` })).toBeVisible()
    // Pedido aprovado do coletivo 1 fica no histórico, sem ação.
    const approved = requests.getByRole('listitem').filter({ hasText: collectiveName(1) })
    await expect(approved).toContainText('aprovado')
    await expect(approved.getByRole('button')).toHaveCount(0)
    // O coletivo 1 já é dela e o 6 tem pedido pendente: nada a pedir.
    await expect(page.getByText('Nenhum coletivo ou produtora aprovado disponível para novos pedidos.')).toBeVisible()
    await expect(page.getByText(/Coletivos com pedido pendente não aparecem na lista/)).toBeVisible()
  })

  test('a proprietária vê o pedido pendente do membro, com nome e botões de decisão, sem decidi-lo', async ({ page }) => {
    await login(page, accounts.active.email)
    await page.goto(`/coletivo/${collectiveId(6)}/solicitacoes`)
    await expect(page).toHaveTitle(`${collectiveName(6)} · Solicitações · CIRCUITO NE`)
    const row = page.getByRole('listitem').filter({ hasText: accounts.member.name })
    await expect(row.getByRole('button', { name: `Aprovar pedido de ${accounts.member.name}` })).toBeVisible()
    await expect(row.getByRole('button', { name: `Recusar pedido de ${accounts.member.name}` })).toBeVisible()
    await expect(sectionNav(page).getByRole('link', { name: /^Solicitações \(\d+\)$/ })).toBeVisible()
    await expect(page.getByText('Quem for aprovado entra com o perfil')).toBeVisible()
  })
})

// Estes testes mudam dados e dividem uma única conta: rodam em sequência e só no projeto desktop.
test.describe('pedir, cancelar, aprovar e recusar entrada', () => {
  test.describe.configure({ mode: 'serial' })
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'os testes que mudam dados rodam uma vez só')
  })

  /** Deixa a candidata sem vínculo e sem pedido pendente no coletivo 6, qualquer que seja o estado anterior. */
  async function restoreApplicant() {
    const mine = await rpcAs<{ id: string; state: string }[]>(accounts.applicant.email, 'get_my_collective_requests')
    for (const request of mine.filter((r) => r.state === 'pending'))
      await rpcAs(accounts.applicant.email, 'cancel_collective_request', { target_request: request.id })
    const collectives = await rpcAs<{ id: string }[]>(accounts.applicant.email, 'list_my_collectives')
    if (collectives.some((c) => c.id === collectiveId(6)))
      await rpcAs(accounts.applicant.email, 'remove_collective_member', { target: collectiveId(6), member: applicantId })
  }
  // O projeto mobile não roda estes testes; os ganchos também não podem tocar a conta enquanto o desktop a usa.
  test.beforeAll(async ({}, testInfo) => {
    if (testInfo.project.name === 'desktop') await restoreApplicant()
  })
  test.afterAll(async ({}, testInfo) => {
    if (testInfo.project.name === 'desktop') await restoreApplicant()
  })

  const myRequests = (page: Page) => panel(page, 'meus pedidos de entrada')
  const requestRow = (page: Page) => myRequests(page).getByRole('listitem').filter({ hasText: collectiveName(6) })

  test('pedido repetido com outra apresentação mostra o erro do banco; depois o pedido é cancelado', async ({ page }) => {
    await login(page, accounts.applicant.email)
    await page.goto('/painel/coletivos')
    await expect(page.getByRole('list', { name: 'Meus coletivos' })).toHaveCount(0)
    await expect(page.getByText('Você ainda não faz parte de nenhum coletivo/produtora.')).toBeVisible()
    const select = page.getByLabel(/Coletivo\/Produtora/)
    await expect(select.locator('option')).toHaveText(['— selecione —', `${collectiveName(1)} (coletivo)`, `${collectiveName(6)} (produtora)`])

    // Outro dispositivo da mesma conta já enviou um pedido com outra apresentação.
    await rpcAs(accounts.applicant.email, 'request_collective_membership', { target: collectiveId(6), message: 'Primeira apresentação' })
    await select.selectOption(collectiveId(6))
    await page.getByLabel(/Mensagem/).fill('Outra apresentação')
    await page.getByRole('button', { name: 'enviar solicitação' }).click()
    await expect(page.getByRole('alert')).toHaveText('[erro] Você já tem um pedido pendente neste coletivo com outra apresentação. Cancele-o antes de enviar um novo.')
    await expect(page.getByRole('status')).toHaveCount(0)

    // A página recarrega e passa a mostrar o pedido que já existia; cancelar só confirma depois do banco.
    await expect(requestRow(page).first()).toContainText('pendente')
    await requestRow(page).first().getByRole('button', { name: `Cancelar pedido para ${collectiveName(6)}` }).click()
    await expect(page.getByRole('status')).toHaveText('Pedido cancelado.')
    await expect(requestRow(page).first()).toContainText('cancelado')
    await expect(requestRow(page).first().getByRole('button')).toHaveCount(0)
    await expect(select.locator('option')).toHaveText(['— selecione —', `${collectiveName(1)} (coletivo)`, `${collectiveName(6)} (produtora)`])
  })

  test('pedir entrada, ser aprovada pela proprietária e acessar só o painel básico', async ({ page, context }) => {
    await login(page, accounts.applicant.email)
    await page.goto('/painel/coletivos')
    await page.getByLabel(/Coletivo\/Produtora/).selectOption(collectiveId(6))
    await page.getByLabel(/Apresentar como/).selectOption({ label: 'Artista · Artista sintético do candidato' })
    await page.getByLabel(/Mensagem/).fill('Toco techno e house em Recife.')
    await page.getByRole('button', { name: 'enviar solicitação' }).click()
    await expect(page.getByRole('status')).toHaveText('Pedido enviado. A administração do coletivo vai analisá-lo.')
    await expect(requestRow(page).filter({ hasText: 'pendente' })).toHaveCount(1)
    // Com pedido pendente o coletivo sai da lista de pedidos possíveis, sem esconder a explicação.
    await expect(page.getByLabel(/Coletivo\/Produtora/).locator('option')).toHaveText(['— selecione —', `${collectiveName(1)} (coletivo)`])
    await expect(page.getByText(/Coletivos com pedido pendente não aparecem na lista/)).toBeVisible()

    // A proprietária vê o pedido (nome da conta, atuação escolhida, mensagem) e aprova.
    await logout(page, context)
    await login(page, accounts.active.email)
    await page.goto(`/coletivo/${collectiveId(6)}/solicitacoes`)
    const row = page.getByRole('listitem').filter({ hasText: accounts.applicant.name })
    await expect(row).toContainText('Artista sintético do candidato')
    await expect(row).toContainText('Artista')
    // A atuação não está publicada: sem link para um perfil que o público não vê.
    await expect(row.getByRole('link')).toHaveCount(0)
    await expect(row).toContainText('“Toco techno e house em Recife.”')
    await row.getByRole('button', { name: `Aprovar pedido de ${accounts.applicant.name}` }).click()
    await expect(page.getByRole('status')).toHaveText('Pedido aprovado. A pessoa agora faz parte do coletivo com o perfil Membro.')
    await expect(page.getByRole('listitem').filter({ hasText: accounts.applicant.name })).toHaveCount(0)
    // O pedido do membro das fixtures continua pendente: ninguém o decidiu.
    await expect(page.getByRole('listitem').filter({ hasText: accounts.member.name })).toBeVisible()

    // Agora a candidata é Membro do coletivo 6, sem permissões operacionais.
    await logout(page, context)
    await login(page, accounts.applicant.email)
    await page.goto('/painel/coletivos')
    const card = page.getByRole('list', { name: 'Meus coletivos' }).getByRole('listitem').filter({ hasText: collectiveName(6) })
    await expect(card).toContainText('Membro')
    await expect(card).not.toContainText('responsável')
    await expect(requestRow(page).first()).toContainText('aprovado')
    await card.getByRole('link', { name: 'abrir dashboard →' }).click()
    await expect(page).toHaveURL(new RegExp(`/coletivo/${collectiveId(6)}/painel$`))
    expect(await sectionLabels(page)).toEqual(['Dashboard'])
    await expect(page.getByText('Seu perfil não gere eventos: aparecem só os eventos publicados.')).toBeVisible()
    await expect(page.getByText('Nenhum evento publicado.')).toBeVisible()
    await expect(page.getByRole('heading', { level: 2, name: 'solicitações de entrada' })).toHaveCount(0)
    await expect(page.getByRole('heading', { level: 2, name: 'mensagens do coletivo' })).toHaveCount(0)
    await openPanelMenu(page)
    await expect(panelNav(page).getByRole('link', { name: /Explorar/ })).toHaveCount(4)

    // Sem "gerir pedidos de entrada", a página de solicitações não mostra a fila.
    const response = await page.goto(`/coletivo/${collectiveId(6)}/solicitacoes`)
    expect(response?.status()).toBe(403)
    await expect(page.getByText('Você não tem permissão para gerir pedidos de entrada neste coletivo.')).toBeVisible()
    await expect(page.getByRole('heading', { level: 1, name: collectiveName(6) })).toBeVisible()
    expect(await sectionLabels(page)).toEqual(['Dashboard'])
    await expect(page.getByText(accounts.member.name)).toHaveCount(0)

    // Sem permissões de eventos: criar e gerir evento também respondem 403 dentro do layout (W8).
    const create = await page.goto(`/coletivo/${collectiveId(6)}/eventos/novo`)
    expect(create?.status()).toBe(403)
    await expect(page.getByText('Você não tem permissão para criar eventos neste coletivo.')).toBeVisible()
    await expect(page.getByRole('heading', { level: 1, name: collectiveName(6) })).toBeVisible()
    const manage = await page.goto(`/coletivo/${collectiveId(6)}/eventos/${eventId(1)}`)
    expect(manage?.status()).toBe(403)
    await expect(page.getByText('Você não tem permissão para gerir eventos neste coletivo.')).toBeVisible()
    expect(await sectionLabels(page)).toEqual(['Dashboard'])
  })

  test('um pedido recusado fica no histórico e a conta pode pedir de novo', async ({ page, context }) => {
    // O teste anterior deixou a candidata como Membro: ela sai do coletivo (saída voluntária) antes de pedir de novo.
    await restoreApplicant()
    await login(page, accounts.applicant.email)
    await page.goto('/painel/coletivos')
    await page.getByLabel(/Coletivo\/Produtora/).selectOption(collectiveId(6))
    await page.getByRole('button', { name: 'enviar solicitação' }).click()
    await expect(page.getByRole('status')).toContainText('Pedido enviado.')

    await logout(page, context)
    await login(page, accounts.active.email)
    await page.goto(`/coletivo/${collectiveId(6)}/solicitacoes`)
    const row = page.getByRole('listitem').filter({ hasText: accounts.applicant.name })
    // Sem atuação nem mensagem: só o nome da conta.
    await expect(row.getByRole('link')).toHaveCount(0)
    await row.getByRole('button', { name: `Recusar pedido de ${accounts.applicant.name}` }).click()
    await expect(page.getByRole('status')).toHaveText('Pedido recusado.')
    await expect(page.getByRole('listitem').filter({ hasText: accounts.applicant.name })).toHaveCount(0)

    await logout(page, context)
    await login(page, accounts.applicant.email)
    await page.goto('/painel/coletivos')
    await expect(page.getByRole('list', { name: 'Meus coletivos' })).toHaveCount(0)
    await expect(requestRow(page).first()).toContainText('recusado')
    await expect(page.getByLabel(/Coletivo\/Produtora/).locator('option')).toHaveText(['— selecione —', `${collectiveName(1)} (coletivo)`, `${collectiveName(6)} (produtora)`])
    // Quem não é mais pedinte nem membro volta a receber 404 no coletivo.
    const response = await page.goto(`/coletivo/${collectiveId(6)}/painel`)
    expect(response?.status()).toBe(404)
  })
})
