import { expect, test, type BrowserContext, type Page } from '@playwright/test'
import { expectNoViolations, settleAnimations } from './a11y'
import { rpcAs } from './rpc'
import { accounts, login, panelNav } from './session'

// Fixtures (identity.sql, collectives.sql, collective-area.sql, events.sql, messages.sql; o CI não carrega demo.sql):
//  Conversa 1: "Artista sintético público" (atuação da fixture-active) <-> "Interlocutor sintético" (atuação da fixture-member);
//    a mensagem semeada é da fixture-active e já foi lida pela fixture-member.
//  Conversa 2: coletivo 1 <-> "Interlocutor sintético", bloqueada pela atuação do membro.
//  Conversa 5: "Atuação excluída" <-> "Artista sintético público": 1 mensagem não lida da fixture-active (dashboard.spec afirma isso).
// Este arquivo muda dados (envia, bloqueia, denuncia) e por isso roda sozinho, depois das demais suítes, num projeto
// próprio (playwright.db.config.ts); o que não dá para desfazer (as mensagens) usa a conversa 1 e uma conversa nova
// da fixture-applicant, e o que muda contagens afirmadas por outras suítes é restaurado.
const conversationId = (n: number) => `0d000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const collectiveId = (n: number) => `05000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const activeProfile = '02000000-0000-4000-8000-000000000001'
const applicantId = '01000000-0000-4000-8000-000000000006'
const activeArtist = 'Artista sintético público'
const memberProfile = 'Interlocutor sintético'
const seeded = 'Mensagem exclusivamente sintética 1 👋'

test.describe.configure({ mode: 'serial' })

// Conversa que a candidata cria no teste "visitante vê ... logado compõe": os testes de envio otimista seguintes a reaproveitam.
let newConversation = ''

let errors: string[]
test.beforeEach(({ page }) => {
  errors = []
  page.on('pageerror', (error) => errors.push(error.message))
})
test.afterEach(() => {
  expect(errors).toEqual([])
})

async function logout(page: Page, context: BrowserContext) {
  await context.clearCookies()
  await page.goto('/entrar')
}

const list = (page: Page) => page.getByRole('navigation', { name: 'Conversas' })
const log = (page: Page) => page.getByRole('log')
// A conversa 1 na central do membro: "Artista sintético público" como a atuação "Interlocutor sintético". A conversa 5 (da atuação
// excluída dele) também tem o artista como interlocutor, mas aparece como "como Atuação excluída".
const withActive = (page: Page) => list(page).getByRole('link', { name: new RegExp(activeArtist) }).filter({ hasText: `como ${memberProfile}` })
const unreadLink = (page: Page) => panelNav(page).getByRole('link', { name: /^Mensagens/ })
const unreadCount = async (page: Page) => Number(/\((\d+)\)/.exec((await unreadLink(page).textContent()) ?? '')?.[1] ?? 0)

test('lista as conversas das atuações e abre uma com as mensagens semeadas, também por link direto', async ({ page }) => {
  await login(page, accounts.active.email)
  await expect(unreadLink(page)).toHaveText('Mensagens (1)')
  await page.goto('/painel/mensagens')
  await expect(page).toHaveTitle('Mensagens · CIRCUITO NE')
  await expect(page.getByRole('heading', { level: 1, name: '$ central_de_mensagens' })).toBeVisible()
  // Tudo o que a conta lê: as atuações (conversas 1 e 5) e o coletivo 1, de que ela é dona (conversa 2, que também fica na área do coletivo).
  // O coletivo 3 está suspenso e o 5 encerrado: as conversas deles não entram.
  await expect(list(page).getByRole('link')).toHaveCount(3)
  await expect(list(page).getByRole('link', { name: /Atuação excluída/ })).toContainText('1 não lida')
  await expect(list(page).getByRole('link', { name: /Atuação excluída/ })).toContainText(`como ${activeArtist}`)
  const viaCollective = list(page).getByRole('link').filter({ hasText: 'como Organização sintética 1 (coletivo)' })
  await expect(viaCollective).toHaveCount(1)
  await expect(viaCollective).toContainText(memberProfile)
  await expect(viaCollective).toContainText('bloqueada')
  const first = list(page).getByRole('link').filter({ hasText: seeded })
  await expect(first).toContainText(`como ${activeArtist}`)
  // Filtro por identidade: "todas" mais uma opção por atuação ou coletivo presente.
  const filter = page.getByRole('combobox', { name: 'Mostrar conversas de' })
  await expect(filter.getByRole('option')).toHaveText(['todas', `${activeArtist} (atuação)`, 'Organização sintética 1 (coletivo)'])
  await filter.selectOption({ label: 'Organização sintética 1 (coletivo)' })
  await expect(list(page).getByRole('link')).toHaveCount(1)
  await expect(viaCollective).toBeVisible()
  await filter.selectOption({ label: 'todas' })
  await expect(list(page).getByRole('link')).toHaveCount(3)
  await first.click()
  await expect(page).toHaveURL(new RegExp(`/painel/mensagens/${conversationId(1)}$`))
  await expect(log(page).getByText(seeded)).toBeVisible()
  await expect(first).toHaveAttribute('aria-current', 'true')

  const reload = await page.reload()
  expect(reload?.status()).toBe(200)
  expect(reload?.headers()['cache-control']).toContain('no-store')
  await expect(log(page).getByText(seeded)).toBeVisible()
  // Nada novo para ler: o contador do menu e do dashboard continua como antes.
  await expect(unreadLink(page)).toHaveText('Mensagens (1)')
})

test('conversa que não existe ou é de outra pessoa responde 404, sem revelar a diferença', async ({ page, context }) => {
  await login(page, accounts.active.email)
  for (const id of [conversationId(99), 'nao-e-uuid']) {
    const response = await page.goto(`/painel/mensagens/${id}`)
    expect(response?.status(), id).toBe(404)
    await expect(page.getByText('Conversa não encontrada.')).toBeVisible()
  }
  await logout(page, context)
  await login(page, accounts.applicant.email)
  const foreign = await page.goto(`/painel/mensagens/${conversationId(1)}`)
  expect(foreign?.status()).toBe(404)
  await expect(page.getByText(seeded)).toHaveCount(0)
})

test('envia uma mensagem como texto puro, que continua lá depois de recarregar', async ({ page }) => {
  await login(page, accounts.active.email)
  await page.goto(`/painel/mensagens/${conversationId(1)}`)
  const text = `Teste ${Date.now()} <b>negrito</b> <img src=x onerror="window.__pwned=1"> **md**`
  await page.getByRole('textbox', { name: `Mensagem para ${memberProfile}` }).fill(text)
  await page.getByRole('button', { name: 'enviar', exact: true }).click()
  // Envio otimista: a mensagem entra na conversa na hora e o campo fica livre; "enviando…" some quando a mensagem real chega.
  await expect(log(page).getByText(text, { exact: true })).toBeVisible()
  await expect(page.getByRole('textbox', { name: `Mensagem para ${memberProfile}` })).toHaveValue('')
  await expect(log(page).getByRole('status')).toHaveCount(0)
  await expect(log(page).getByText(text, { exact: true })).toHaveCount(1)
  expect(await log(page).locator('b, img').count()).toBe(0)
  expect(await page.evaluate(() => (window as unknown as { __pwned?: number }).__pwned)).toBeUndefined()
  await page.reload()
  await expect(log(page).getByText(text, { exact: true })).toBeVisible()
  // Quem envia nunca fica com a própria mensagem como não lida.
  await expect(unreadLink(page)).toHaveText('Mensagens (1)')
})

test('a outra pessoa vê a mensagem como não lida; ao abrir, a contagem cai e a conversa deixa de ter não lidas', async ({ page }) => {
  await login(page, accounts.member.email)
  await page.goto('/painel/mensagens')
  const conversation = withActive(page)
  await expect(conversation).toContainText('não lida')
  const before = await unreadCount(page)
  expect(before).toBeGreaterThan(0)

  await conversation.click()
  await expect(log(page).getByText(/Teste \d+/).last()).toBeVisible()
  // Marcar como lida é uma ação do servidor; o menu e a lista são recarregados em seguida.
  await expect.poll(() => unreadCount(page)).toBe(before - 1)
  await expect(conversation).not.toContainText('não lida')
  await page.reload()
  await expect(conversation).not.toContainText('não lida')
  expect(await unreadCount(page)).toBe(before - 1)
  // O dashboard usa o mesmo contador.
  await page.goto('/painel')
  expect(await unreadCount(page)).toBe(before - 1)
})

test('a outra pessoa denuncia uma mensagem recebida, com o motivo', async ({ page }) => {
  await login(page, accounts.member.email)
  await page.goto(`/painel/mensagens/${conversationId(1)}`)
  const message = log(page).getByRole('listitem').filter({ hasText: seeded })
  await message.getByText('denunciar').click()
  await message.getByRole('textbox', { name: 'Motivo da denúncia' }).fill('Mensagem de teste automatizado')
  await message.getByRole('button', { name: /Enviar denúncia/ }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Denúncia enviada.' })).toBeVisible()
})

test('conversa bloqueada recusa o envio mesmo com a tela aberta; só quem bloqueou desbloqueia', async ({ page, context }) => {
  const send = (text: string) => page.getByRole('textbox', { name: `Mensagem para ${activeArtist}` }).fill(text)
  await login(page, accounts.member.email)
  await page.goto(`/painel/mensagens/${conversationId(1)}`)
  await expect(page.getByRole('textbox', { name: `Mensagem para ${activeArtist}` })).toBeVisible()
  try {
    // Outro dispositivo da fixture-active bloqueia enquanto esta tela segue aberta, com o campo de envio.
    await rpcAs(accounts.active.email, 'set_conversation_block', { target: conversationId(1), as_kind: 'profile', as_id: activeProfile, blocked: true })
    await send('Não deve passar')
    await page.getByRole('button', { name: 'enviar', exact: true }).click()
    await expect(page.getByRole('alert')).toContainText('Esta conversa está bloqueada')
    // A tela recarregou depois da recusa: agora mostra o bloqueio e não oferece envio nem desbloqueio.
    await expect(page.getByText(/Conversa bloqueada: ninguém envia mensagens/)).toBeVisible()
    await expect(page.getByRole('textbox', { name: `Mensagem para ${activeArtist}` })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'desbloquear' })).toHaveCount(0)
    await expect(withActive(page)).toContainText('bloqueada')

    await logout(page, context)
    await login(page, accounts.active.email)
    await page.goto(`/painel/mensagens/${conversationId(1)}`)
    await expect(page.getByText(/Só quem bloqueou pode desbloquear, e foi você\./)).toBeVisible()
    await page.getByRole('button', { name: 'desbloquear' }).click()
    await expect(page.getByRole('status').filter({ hasText: 'Bloqueio removido.' })).toBeVisible()
    await expect(page.getByRole('textbox', { name: `Mensagem para ${memberProfile}` })).toBeVisible()
    // Bloquear pela interface também só confirma depois do banco, e desfaz.
    await page.getByRole('button', { name: 'bloquear conversa' }).click()
    await expect(page.getByRole('status').filter({ hasText: 'Conversa bloqueada.' })).toBeVisible()
    await expect(page.getByRole('textbox', { name: `Mensagem para ${memberProfile}` })).toHaveCount(0)
    await page.getByRole('button', { name: 'desbloquear' }).click()
    await expect(page.getByRole('status').filter({ hasText: 'Bloqueio removido.' })).toBeVisible()
  } finally {
    await rpcAs(accounts.active.email, 'set_conversation_block', { target: conversationId(1), as_kind: 'profile', as_id: activeProfile, blocked: false })
  }
})

test('o coletivo 1 vê a conversa dele, bloqueada pelo outro lado, sem campo de envio', async ({ page }) => {
  await login(page, accounts.active.email)
  await page.goto(`/coletivo/${collectiveId(1)}/mensagens`)
  await expect(page).toHaveTitle('Organização sintética 1 · Mensagens · CIRCUITO NE')
  await expect(page.getByRole('navigation', { name: 'Seções do coletivo' }).getByRole('link', { name: 'Mensagens' })).toBeVisible()
  const conversation = list(page).getByRole('link', { name: new RegExp(memberProfile) })
  await expect(list(page).getByRole('link')).toHaveCount(1)
  await expect(conversation).toContainText('bloqueada')
  await conversation.click()
  await expect(page).toHaveURL(new RegExp(`/coletivo/${collectiveId(1)}/mensagens/${conversationId(2)}$`))
  await expect(log(page).getByText('Mensagem exclusivamente sintética 2 👋')).toBeVisible()
  await expect(page.getByText(/Só quem bloqueou pode desbloquear\./)).toBeVisible()
  await expect(page.getByRole('textbox', { name: /Mensagem para/ })).toHaveCount(0)
  // Link direto e recarga continuam funcionando; o dashboard do coletivo segue com 1 conversa.
  await page.reload()
  await expect(log(page).getByText('Mensagem exclusivamente sintética 2 👋')).toBeVisible()
  await page.goto(`/coletivo/${collectiveId(1)}/painel`)
  await expect(page.getByRole('heading', { level: 2, name: 'mensagens do coletivo' }).locator('xpath=ancestor::section')).toContainText(/em 1 conversa\./)
})

test('membro sem "ler mensagens" recebe 403 na lista e no link direto da conversa', async ({ page, context }) => {
  const restore = async () => {
    const mine = await rpcAs<{ id: string }[]>(accounts.applicant.email, 'list_my_collectives')
    if (mine.some((c) => c.id === collectiveId(6)))
      await rpcAs(accounts.applicant.email, 'remove_collective_member', { target: collectiveId(6), member: applicantId })
    const requests = await rpcAs<{ id: string; state: string }[]>(accounts.applicant.email, 'get_my_collective_requests')
    for (const request of requests.filter((r) => r.state === 'pending'))
      await rpcAs(accounts.applicant.email, 'cancel_collective_request', { target_request: request.id })
  }
  await restore()
  try {
    // A candidata entra no coletivo 6 como Membro, sem permissões operacionais (como em collective.spec.ts).
    await rpcAs(accounts.applicant.email, 'request_collective_membership', { target: collectiveId(6), message: 'Teste de mensagens' })
    const pending = await rpcAs<{ id: string; state: string; collective_id: string }[]>(accounts.applicant.email, 'get_my_collective_requests')
    const request = pending.find((r) => r.state === 'pending' && r.collective_id === collectiveId(6))
    expect(request).toBeTruthy()
    await rpcAs(accounts.active.email, 'decide_collective_request', { target_request: request!.id, approve: true })

    await logout(page, context)
    await login(page, accounts.applicant.email)
    for (const path of ['mensagens', `mensagens/${conversationId(2)}`]) {
      const response = await page.goto(`/coletivo/${collectiveId(6)}/${path}`)
      expect(response?.status(), path).toBe(403)
      await expect(page.getByText('Você não tem permissão para ler as mensagens deste coletivo.')).toBeVisible()
      // O layout do coletivo continua (a seção é que está bloqueada) e o menu não oferece mensagens.
      await expect(page.getByRole('navigation', { name: 'Seções do coletivo' })).toBeVisible()
      await expect(page.getByRole('navigation', { name: 'Seções do coletivo' }).getByRole('link', { name: 'Mensagens' })).toHaveCount(0)
    }
  } finally {
    await restore()
  }
})

test('visitante vê "Entrar para enviar mensagem"; logado compõe, envia e cai na conversa criada', async ({ page, context }) => {
  await logout(page, context)
  await page.goto(`/artistas/${activeProfile}`)
  await expect(page.getByRole('link', { name: 'Entrar para enviar mensagem' })).toHaveAttribute('href', '/entrar')
  await page.getByRole('link', { name: 'Entrar para enviar mensagem' }).click()
  await expect(page).toHaveURL(/\/entrar$/)

  await login(page, accounts.applicant.email)
  await page.goto(`/coletivos/${collectiveId(1)}`)
  await expect(page.getByRole('link', { name: 'Enviar mensagem' })).toHaveAttribute('href', `/painel/mensagens/nova?para=collective:${collectiveId(1)}`)

  // O clique comum abre o chat flutuante (chat-dock.spec.ts); a tela completa continua valendo pelo link (nova aba, sem JavaScript).
  await page.goto(`/artistas/${activeProfile}`)
  await page.goto((await page.getByRole('link', { name: 'Enviar mensagem' }).getAttribute('href'))!)
  await expect(page).toHaveURL(new RegExp(`/painel/mensagens/nova\\?para=profile:${activeProfile}$`))
  await expect(page.getByRole('heading', { level: 2, name: `para ${activeArtist}` })).toBeVisible()
  const text = `Primeiro contato ${Date.now()}`
  await page.getByRole('textbox', { name: `Mensagem para ${activeArtist}` }).fill(text)
  await page.getByRole('button', { name: 'enviar mensagem' }).click()
  await expect(page).toHaveURL(/\/painel\/mensagens\/[0-9a-f-]{36}$/)
  await expect(log(page).getByText(text, { exact: true })).toBeVisible()
  await expect(list(page).getByRole('link', { name: new RegExp(activeArtist) })).toBeVisible()
  const conversation = page.url().split('/').pop()!
  newConversation = conversation

  // A destinatária vê a conversa nova como não lida.
  await logout(page, context)
  await login(page, accounts.active.email)
  await expect(unreadLink(page)).toHaveText('Mensagens (2)')
  await page.goto('/painel/mensagens')
  await expect(list(page).getByRole('link', { name: /Artista sintético do candidato/ })).toContainText('1 não lida')

  // Restaura o que o dashboard.spec.ts afirma (1 mensagem não lida, da conversa 5): marca a nova como lida.
  const messages = await rpcAs<{ id: string }[]>(accounts.active.email, 'get_recent_messages', { target: conversation })
  await rpcAs(accounts.active.email, 'mark_conversation_read', { target: conversation, last_message: messages[messages.length - 1].id })
  await page.goto('/painel')
  await expect(unreadLink(page)).toHaveText('Mensagens (1)')
})

/** Devolve à fixture-active a contagem que as demais suítes afirmam (1 não lida, da conversa 5): lê a conversa que a candidata criou. */
async function markNewConversationRead() {
  const messages = await rpcAs<{ id: string }[]>(accounts.active.email, 'get_recent_messages', { target: newConversation })
  await rpcAs(accounts.active.email, 'mark_conversation_read', { target: newConversation, last_message: messages[messages.length - 1].id })
}

test('envio otimista: a mensagem aparece na hora, com o campo livre, e a real a substitui quando o servidor responde', async ({ page, context }) => {
  await logout(page, context)
  await login(page, accounts.applicant.email)
  await page.goto(`/painel/mensagens/${newConversation}`)
  const field = page.getByRole('textbox', { name: `Mensagem para ${activeArtist}` })
  // O envio fica retido na rede até o teste liberar: o que aparece antes disso é só o lado do navegador.
  let release!: () => void
  const held = new Promise<void>((resolve) => (release = resolve))
  await page.route('**/api/chat/enviar', async (route) => {
    await held
    await route.continue()
  })
  const text = `Otimista ${Date.now()}`
  try {
    await field.fill(text)
    await page.getByRole('button', { name: 'enviar', exact: true }).click()
    const bubble = log(page).getByRole('listitem').filter({ hasText: text })
    await expect(bubble).toBeVisible()
    await expect(bubble.getByRole('status')).toHaveText('enviando…')
    await expect(field).toHaveValue('')
    await expect(field).toBeFocused()
    release()
    await expect(bubble.getByRole('status')).toHaveCount(0)
    await expect(log(page).getByText(text, { exact: true })).toHaveCount(1)
    await expect(list(page).getByRole('link', { name: new RegExp(activeArtist) })).toContainText(text)
    await page.reload()
    await expect(log(page).getByText(text, { exact: true })).toHaveCount(1)
  } finally {
    release()
    await page.unroute('**/api/chat/enviar').catch(() => {})
    await markNewConversationRead()
  }
})

test('falha ao enviar: "mensagem não enviada" embaixo da mensagem; "tentar de novo" reenvia com a mesma chave e a mensagem fica uma só', async ({ page }) => {
  // Cada teste tem o seu contexto: a sessão da candidata do teste anterior não vem junto.
  await login(page, accounts.applicant.email)
  await page.goto(`/painel/mensagens/${newConversation}`)
  const field = page.getByRole('textbox', { name: `Mensagem para ${activeArtist}` })
  const requestIds: string[] = []
  let failNext = true
  await page.route('**/api/chat/enviar', async (route) => {
    requestIds.push(new URLSearchParams(route.request().postData() ?? '').get('request_id') ?? '')
    if (failNext) {
      failNext = false
      return route.abort('failed')
    }
    return route.continue()
  })
  const send = async (text: string) => {
    await field.fill(text)
    await page.getByRole('button', { name: 'enviar', exact: true }).click()
    return log(page).getByRole('listitem').filter({ hasText: text })
  }
  try {
    const text = `Falha ${Date.now()}`
    const bubble = await send(text)
    // A mensagem fica na conversa e o aviso aparece embaixo dela; o campo já está livre para a próxima.
    await expect(bubble.getByRole('alert')).toContainText('mensagem não enviada')
    await expect(bubble.getByRole('alert')).toContainText('Sem conexão')
    await expect(field).toHaveValue('')
    await settleAnimations(page)
    await expectNoViolations(page, 'conversa com mensagem não enviada')
    await bubble.getByRole('button', { name: /tentar de novo/ }).click()
    await expect(bubble.getByRole('alert')).toHaveCount(0)
    await expect(bubble.getByRole('status')).toHaveCount(0)
    await expect(page.getByText('mensagem não enviada')).toHaveCount(0)
    await expect(log(page).getByText(text, { exact: true })).toHaveCount(1)
    expect(requestIds).toHaveLength(2)
    expect(requestIds[1]).toBe(requestIds[0])

    // Descartar: a mensagem some da tela e nada é enviado.
    failNext = true
    const discarded = `Descartada ${Date.now()}`
    const failed = await send(discarded)
    await expect(failed.getByRole('alert')).toContainText('mensagem não enviada')
    await failed.getByRole('button', { name: /descartar/ }).click()
    await expect(log(page).getByText(discarded, { exact: true })).toHaveCount(0)
    expect(requestIds).toHaveLength(3)

    await page.reload()
    await expect(log(page).getByText(text, { exact: true })).toHaveCount(1)
    await expect(log(page).getByText(discarded, { exact: true })).toHaveCount(0)
  } finally {
    await page.unroute('**/api/chat/enviar').catch(() => {})
    await markNewConversationRead()
  }
})

test('o destinatário inválido da nova conversa responde 404', async ({ page, context }) => {
  await logout(page, context)
  await login(page, accounts.applicant.email)
  for (const para of ['', 'profile:x', `profile:${conversationId(1)}`, `user:${applicantId}`]) {
    const response = await page.goto(`/painel/mensagens/nova?para=${para}`)
    expect(response?.status(), para).toBe(404)
    await expect(page.getByText('Interlocutor não encontrado.')).toBeVisible()
  }
})
