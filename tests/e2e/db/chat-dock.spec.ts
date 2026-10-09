import { expect, test, type Page } from '@playwright/test'
import { rpcAs } from './rpc'
import { accounts, login, panelNav } from './session'

// Fixtures (identity.sql, collectives.sql, messages.sql; o CI não carrega demo.sql):
//  Artista público "Artista sintético público" (02..01, fixture-active) tem a conversa 1 com "Interlocutor sintético" (fixture-member).
//  fixture-member tem também a atuação (não publicada) "Artista sintético do membro": enviar por ela cria uma conversa nova.
// Roda sozinho, depois de messages.spec.ts, num projeto de escrita (playwright.db.config.ts). Mensagens não se apagam: o que
// muda contagens afirmadas por outras suítes (não lidas da fixture-active) é restaurado por RPC.
const activeProfile = '02000000-0000-4000-8000-000000000001'
const activeArtist = 'Artista sintético público'
const memberArtist = 'Artista sintético do membro'
const memberProfile = 'Interlocutor sintético'
const seeded = 'Mensagem exclusivamente sintética 1 👋'
const collectiveId = '05000000-0000-4000-8000-000000000001'

test.describe.configure({ mode: 'serial' })

let errors: string[]
test.beforeEach(({ page }) => {
  errors = []
  page.on('pageerror', (error) => errors.push(error.message))
})
test.afterEach(() => {
  expect(errors).toEqual([])
})

const dialog = (page: Page, name = activeArtist) => page.getByRole('dialog', { name: `Conversa com ${name}` })
const field = (page: Page) => dialog(page).getByRole('textbox', { name: `Mensagem para ${activeArtist}` })
const log = (page: Page) => dialog(page).getByRole('log')
const openLink = (page: Page) => page.getByRole('link', { name: 'Enviar mensagem', exact: true })
const unreadLink = (page: Page) => panelNav(page).getByRole('link', { name: /^Mensagens/ })
const unreadCount = async (page: Page) => Number(/\((\d+)\)/.exec((await unreadLink(page).textContent()) ?? '')?.[1] ?? 0)

/** Sai pela interface (o botão limpa as janelas guardadas na aba, como no uso real). */
async function logout(page: Page) {
  await page.goto('/painel')
  await page.getByRole('button', { name: '[→] Sair da sessão' }).click()
  await expect(page).toHaveURL(/\/entrar$/)
}

let newConversation = ''
let newText = ''

test('visitante vê "Entrar para enviar mensagem" no lugar do chat, e nenhuma janela', async ({ page }) => {
  await page.goto(`/artistas/${activeProfile}`)
  await expect(page.getByRole('link', { name: 'Entrar para enviar mensagem' })).toHaveAttribute('href', '/entrar')
  await expect(openLink(page)).toHaveCount(0)
  await expect(page.getByRole('dialog')).toHaveCount(0)
  // Nem a API responde a quem não tem sessão.
  const response = await page.request.get(`/api/chat/abrir?para=profile:${activeProfile}`)
  expect(response.status()).toBe(401)
  expect(response.headers()['cache-control']).toContain('no-store')
  await page.getByRole('link', { name: 'Entrar para enviar mensagem' }).click()
  await expect(page).toHaveURL(/\/entrar$/)
})

test('"Enviar mensagem" abre a janela no canto sem recarregar nem mudar a URL, com a conversa que já existe e o foco no campo', async ({ page }) => {
  await login(page, accounts.member.email)
  await page.goto(`/artistas/${activeProfile}`)
  const url = page.url()
  await page.evaluate(() => ((window as unknown as { __marker?: number }).__marker = 1))
  const opener = openLink(page)
  await expect(opener).toHaveAttribute('aria-haspopup', 'dialog')
  await opener.click()

  await expect(dialog(page)).toBeVisible()
  expect(page.url()).toBe(url)
  expect(await page.evaluate(() => (window as unknown as { __marker?: number }).__marker)).toBe(1)
  await expect(dialog(page)).toHaveAttribute('aria-modal', 'false')
  await expect(field(page)).toBeFocused()
  // A conversa 1 (do "Interlocutor sintético") já existe: a janela a carrega, com o link para a tela completa.
  await expect(log(page).getByText(seeded)).toBeVisible()
  await expect(dialog(page).getByRole('link', { name: 'abrir conversa completa' })).toHaveAttribute('href', /\/painel\/mensagens\/[0-9a-f-]{36}$/)
  // Dois identidades e o coletivo em que o membro pode enviar: o seletor aparece.
  await expect(dialog(page).getByRole('combobox', { name: 'Enviar como' })).toBeVisible()
  // No canto inferior direito.
  const box = (await dialog(page).boundingBox())!
  const viewport = page.viewportSize()!
  expect(box.x + box.width).toBeGreaterThan(viewport.width - 40)
  expect(box.y + box.height).toBeGreaterThan(viewport.height - 4)

  // Esc minimiza e devolve o foco ao botão que abriu; a barra reabre a janela com o foco no campo.
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(opener).toBeFocused()
  const bar = page.getByRole('button', { name: `Abrir conversa com ${activeArtist}` })
  await expect(bar).toHaveAttribute('aria-expanded', 'false')
  await bar.click()
  await expect(field(page)).toBeFocused()
  await dialog(page).getByRole('button', { name: `Fechar conversa com ${activeArtist}` }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.getByRole('button', { name: /^Abrir conversa com/ })).toHaveCount(0)
})

test('envia como outra atuação: a conversa nova nasce no primeiro envio, a janela acompanha a navegação e sobrevive à recarga; a outra pessoa a vê como não lida', async ({ page }) => {
  await login(page, accounts.member.email)
  await page.goto(`/artistas/${activeProfile}`)
  const url = page.url()
  await page.evaluate(() => ((window as unknown as { __marker?: number }).__marker = 1))
  await openLink(page).click()
  await expect(log(page).getByText(seeded)).toBeVisible()
  await dialog(page).getByRole('combobox', { name: 'Enviar como' }).selectOption({ label: memberArtist })
  await expect(dialog(page).getByText('Nenhuma mensagem ainda. Escreva a primeira.')).toBeVisible()
  await expect(dialog(page).getByRole('link', { name: 'abrir conversa completa' })).toHaveCount(0)

  newText = `Olá pelo chat ${Date.now()} <b>negrito</b>`
  await field(page).fill(newText)
  await dialog(page).getByRole('button', { name: 'enviar', exact: true }).click()
  await expect(log(page).getByText(newText, { exact: true })).toBeVisible()
  await expect(field(page)).toHaveValue('')
  expect(await log(page).locator('b').count()).toBe(0)
  expect(page.url()).toBe(url)
  expect(await page.evaluate(() => (window as unknown as { __marker?: number }).__marker)).toBe(1)
  const full = dialog(page).getByRole('link', { name: 'abrir conversa completa' })
  await expect(full).toHaveAttribute('href', /\/painel\/mensagens\/[0-9a-f-]{36}$/)
  newConversation = (await full.getAttribute('href'))!.split('/').pop()!

  // A janela fica ao navegar no cliente (mesmo layout e outro layout) e o contador do menu do painel é o do banco.
  await page.getByRole('navigation', { name: 'Principal' }).getByRole('link', { name: 'Artistas', exact: true }).click()
  await expect(page).toHaveURL(/\/artistas$/)
  await expect(dialog(page)).toBeVisible()
  await page.getByRole('navigation', { name: 'Principal' }).getByRole('link', { name: 'Painel' }).click()
  await expect(page).toHaveURL(/\/painel$/)
  await expect(dialog(page)).toBeVisible()
  expect(await page.evaluate(() => (window as unknown as { __marker?: number }).__marker)).toBe(1)
  await expect(log(page).getByText(newText, { exact: true })).toBeVisible()
  // O link da tela completa leva à mesma conversa; a janela continua depois de navegar.
  await dialog(page).getByRole('link', { name: 'abrir conversa completa' }).click()
  await expect(page).toHaveURL(new RegExp(`/painel/mensagens/${newConversation}$`))
  await expect(page.getByRole('log').filter({ hasText: newText }).first()).toBeVisible()
  await expect(dialog(page)).toBeVisible()

  // Recarregar a página: a janela volta (mesma aba) com o histórico, sem roubar o foco.
  await page.reload()
  await expect(dialog(page)).toBeVisible()
  await expect(log(page).getByText(newText, { exact: true })).toBeVisible()
  await expect(field(page)).not.toBeFocused()

  // A conversa existe na central de mensagens depois da recarga.
  await page.goto('/painel/mensagens')
  const list = page.getByRole('navigation', { name: 'Conversas' })
  await expect(list.getByRole('link').filter({ hasText: newText })).toContainText(activeArtist)

  // Sair limpa as janelas guardadas na aba: quem entra depois não herda a conversa do usuário anterior.
  await logout(page)
  await login(page, accounts.active.email)
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(unreadLink(page)).toHaveText('Mensagens (2)')
  await page.goto('/painel/mensagens')
  const received = page.getByRole('navigation', { name: 'Conversas' })
  await expect(received.getByRole('link').filter({ hasText: newText })).toContainText('1 não lida')

  // Restaura o que o dashboard.spec.ts afirma (1 não lida, da conversa 5).
  const messages = await rpcAs<{ id: string }[]>(accounts.active.email, 'get_recent_messages', { target: newConversation })
  await rpcAs(accounts.active.email, 'mark_conversation_read', { target: newConversation, last_message: messages[messages.length - 1].id })
  await page.goto('/painel')
  await expect(unreadLink(page)).toHaveText('Mensagens (1)')
})

test('a janela aberta marca como lida e traz respostas pela atualização periódica, sem recarregar', async ({ page }) => {
  test.setTimeout(90_000)
  await login(page, accounts.member.email)

  const baseline = await unreadCount(page)
  await page.goto(`/artistas/${activeProfile}`)
  await openLink(page).click()
  await expect(log(page).getByText(newText, { exact: true })).toBeVisible()
  const mine = await rpcAs<{ id: string; name: string }[]>(accounts.member.email, 'list_my_profiles')
  const memberArtistId = mine.find((profile) => profile.name === memberArtist)!.id
  const reply = `Resposta ${Date.now()}`
  const marked = page.waitForResponse((response) => response.url().endsWith('/api/chat/lida') && response.request().method() === 'POST', { timeout: 40_000 })
  await rpcAs(accounts.active.email, 'send_message', {
    sender_kind: 'profile', sender: activeProfile, recipient_kind: 'profile', recipient: memberArtistId, body: reply, request_id: crypto.randomUUID(),
  })
  await expect(log(page).getByText(reply, { exact: true })).toBeVisible({ timeout: 40_000 })
  expect((await marked).status()).toBe(200)
  const conversations = await rpcAs<{ id: string; unread_count: number }[]>(accounts.member.email, 'list_conversations')
  expect(conversations.find((conversation) => conversation.id === newConversation)?.unread_count).toBe(0)
  await page.goto('/painel')
  await expect(unreadLink(page)).toHaveText(baseline > 0 ? `Mensagens (${baseline})` : 'Mensagens')
})

test('envio otimista na janela: a mensagem aparece na hora; se o envio falhar, "mensagem não enviada" e "tentar de novo" reenvia com a mesma chave', async ({ page }) => {
  await login(page, accounts.member.email)
  await page.goto(`/artistas/${activeProfile}`)
  await openLink(page).click()
  await expect(log(page).getByText(newText, { exact: true })).toBeVisible()

  // `hold`: o envio fica retido na rede até o teste liberar; `fail`: a conexão cai uma vez; `pass`: segue normalmente.
  let mode: 'hold' | 'fail' | 'pass' = 'hold'
  let release!: () => void
  const held = new Promise<void>((resolve) => (release = resolve))
  const requestIds: string[] = []
  await page.route('**/api/chat/enviar', async (route) => {
    requestIds.push(new URLSearchParams(route.request().postData() ?? '').get('request_id') ?? '')
    if (mode === 'hold') await held
    if (mode === 'fail') {
      mode = 'pass'
      return route.abort('failed')
    }
    return route.continue()
  })
  const send = async (text: string) => {
    await field(page).fill(text)
    await dialog(page).getByRole('button', { name: 'enviar', exact: true }).click()
    return log(page).getByRole('listitem').filter({ hasText: text })
  }
  try {
    // Sem esperar o servidor: o balão está na conversa, marcado, e o campo livre.
    const quick = `Janela rápida ${Date.now()}`
    const first = await send(quick)
    await expect(first).toBeVisible()
    await expect(first.getByRole('status')).toHaveText('enviando…')
    await expect(field(page)).toHaveValue('')
    release()
    await expect(first.getByRole('status')).toHaveCount(0)
    await expect(log(page).getByText(quick, { exact: true })).toHaveCount(1)

    mode = 'fail'
    const text = `Janela falha ${Date.now()}`
    const bubble = await send(text)
    await expect(bubble.getByRole('alert')).toContainText('mensagem não enviada')
    await expect(field(page)).toHaveValue('')
    const failedId = requestIds[requestIds.length - 1]
    await bubble.getByRole('button', { name: /tentar de novo/ }).click()
    await expect(bubble.getByRole('alert')).toHaveCount(0)
    await expect(page.getByText('mensagem não enviada')).toHaveCount(0)
    await expect(log(page).getByText(text, { exact: true })).toHaveCount(1)
    expect(requestIds[requestIds.length - 1]).toBe(failedId)

    await page.reload()
    await expect(log(page).getByText(text, { exact: true })).toHaveCount(1)
    await expect(log(page).getByText(quick, { exact: true })).toHaveCount(1)
  } finally {
    release()
    await page.unroute('**/api/chat/enviar')
    // Restaura o que o dashboard.spec.ts afirma (1 não lida, da conversa 5): a fixture-active lê as mensagens novas.
    const messages = await rpcAs<{ id: string }[]>(accounts.active.email, 'get_recent_messages', { target: newConversation })
    await rpcAs(accounts.active.email, 'mark_conversation_read', { target: newConversation, last_message: messages[messages.length - 1].id })
  }
})

test('o coletivo também abre a janela (como o coletivo ou como uma atuação)', async ({ page }) => {
  await login(page, accounts.applicant.email)
  await page.goto(`/coletivos/${collectiveId}`)
  const url = page.url()
  await openLink(page).click()
  await expect(page.getByRole('dialog', { name: /^Conversa com Organização sintética 1$/ })).toBeVisible()
  expect(page.url()).toBe(url)
  await expect(page.getByRole('textbox', { name: 'Mensagem para Organização sintética 1' })).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)
})

test.describe('celular (390 px)', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test('a janela vira uma folha na largura da tela, sem rolagem horizontal', async ({ page }) => {
    await login(page, accounts.member.email)
    await page.goto(`/artistas/${activeProfile}`)
    await openLink(page).click()
    await expect(dialog(page)).toBeVisible()
    await expect(field(page)).toBeFocused()
    const box = (await dialog(page).boundingBox())!
    expect(box.x).toBeLessThanOrEqual(1)
    expect(box.x + box.width).toBeGreaterThanOrEqual(389)
    expect(box.y + box.height).toBeGreaterThan(843)
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
    // Minimizada, é uma barra na largura da tela.
    await page.keyboard.press('Escape')
    const bar = page.getByRole('button', { name: `Abrir conversa com ${activeArtist}` })
    await expect(bar).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
  })
})
