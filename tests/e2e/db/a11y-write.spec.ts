import { expect, test, type Locator, type Page } from '@playwright/test'
import { artist, collective, expectNoViolations, hydrated, settleAnimations } from './a11y'
import { controlBorderFailures, textContrastFailures } from './a11y-checks'
import { focusWalk, reflowFailures } from './a11y-layout'
import { rpcAs } from './rpc'
import { accounts, login } from './session'

// Estados e jornadas de acessibilidade (W16) que gravam dados, nos dois tamanhos de tela (projetos `a11y-write-*` de
// playwright.db.config.ts, depois de todos os outros): a tela de cadastro do autenticador (MFA), as etapas do cadastro e as
// jornadas só por teclado (cadastro, criar evento, editar dados, enviar mensagem pelo chat flutuante). Cada teste desfaz o que
// altera, exceto o que o produto não apaga (contas de cadastro, rascunho de evento cancelado e mensagem enviada), como os demais
// specs de escrita; nada disso é afirmado por outro spec.
const PASSWORD = 'senha-de-teste-123'
const TEST_CODE = '123456'
const TEST_PHONES = Array.from({ length: 8 }, (_, index) => `81 99990-000${index + 1}`)
const activeProfile = artist
const NL = '\n'

let errors: string[]
test.beforeEach(({ page }) => {
  errors = []
  page.on('pageerror', (error) => errors.push(error.message))
})
test.afterEach(() => {
  expect(errors).toEqual([])
})
test.describe.configure({ mode: 'serial' })

async function expectAccessible(page: Page, label: string) {
  await settleAnimations(page)
  await expectNoViolations(page, label)
  const failures = [...(await textContrastFailures(page)), ...(await controlBorderFailures(page)), ...(await reflowFailures(page))]
  expect.soft(failures.join(NL), `${label}: contraste e reflow`).toBe('')
}

const open = async (page: Page, path: string) => {
  await page.goto(path)
  await hydrated(page)
}

/** Só teclado: aperta Tab até o elemento receber o foco (falha se não for alcançável) — nada de clique nem `focus()`. */
async function tabTo(page: Page, target: Locator, max = 150) {
  for (let step = 0; step < max; step++) {
    if (await target.evaluate((element) => element === document.activeElement)) return
    await page.keyboard.press('Tab')
  }
  throw new Error(`não alcançado com Tab em ${max} passos: ${target}`)
}

/** Alcança o campo por Tab e digita nele. */
async function typeInto(page: Page, field: Locator, text: string) {
  await tabTo(page, field)
  await page.keyboard.type(text)
}

/** Sorteia um CPF válido (dígitos verificadores calculados), diferente do das fixtures. */
function validCpf(): string {
  const base = Array.from({ length: 9 }, () => Math.floor(Math.random() * 10))
  if (base.every((digit) => digit === base[0])) base[8] = (base[8] + 1) % 10
  const check = (digits: number[]) => ((digits.reduce((sum, digit, index) => sum + digit * (digits.length + 1 - index), 0) * 10) % 11) % 10
  const first = check(base)
  const second = check([...base, first])
  const all = [...base, first, second].join('')
  return `${all.slice(0, 3)}.${all.slice(3, 6)}.${all.slice(6, 9)}-${all.slice(9)}`
}

test('cadastro do aplicativo autenticador (MFA): QR code com alternativa em texto, sem violações, e a configuração é cancelável', async ({ page }) => {
  await login(page, accounts.applicant.email)
  await open(page, '/painel/seguranca')
  await expectAccessible(page, 'segurança sem MFA')
  await page.getByRole('button', { name: 'configurar aplicativo autenticador' }).click()
  const qr = page.getByRole('img', { name: 'QR code para cadastrar o aplicativo autenticador' })
  try {
    await expect(qr).toBeVisible()
    // A chave em texto é a alternativa ao QR code (1.1.1) e o campo do código aceita colar e autopreenchimento (3.3.8).
    await expect(page.getByTestId('mfa-secret')).toHaveText(/[A-Z2-7]{16,}/)
    await expect(page.getByLabel(/Código do aplicativo/)).toHaveAttribute('autocomplete', 'one-time-code')
    await expectAccessible(page, 'segurança com o QR code da MFA')
    // Código errado: o erro fica ligado ao campo e o foco vai para ele.
    await page.getByLabel(/Código do aplicativo/).fill('000000')
    await page.getByRole('button', { name: 'ativar' }).click()
    await expect(page.locator('[aria-invalid="true"], [role="alert"]').first()).toBeVisible()
    await expectAccessible(page, 'segurança com código de MFA recusado')
  } finally {
    // Desfaz: "cancelar" remove o fator ainda não verificado.
    await page.getByRole('button', { name: 'cancelar' }).click()
    await expect(page.getByRole('button', { name: 'configurar aplicativo autenticador' })).toBeVisible()
  }
})

test('cadastro por teclado, etapa a etapa (conta, celular, código, dados e atuação): sem violações, nenhum dado pedido de novo e retomada pelo servidor', async ({ page }) => {
  test.setTimeout(120_000)
  const email = `a11y-${Date.now().toString(36)}-${test.info().project.name}@example.invalid`
  const cpf = validCpf()
  await open(page, '/cadastro')
  await expectAccessible(page, 'cadastro: conta')

  // Etapa 1 (conta): e-mail e senha por teclado; Enter no último campo envia. Colar e gerenciador de senhas não são bloqueados.
  await typeInto(page, page.getByLabel(/E-mail/).first(), email)
  await typeInto(page, page.locator('input[name="senha"]'), PASSWORD)
  await typeInto(page, page.locator('input[name="conf"]'), PASSWORD)
  await page.keyboard.press('Enter')
  await expect(page.getByRole('heading', { name: 'Confirme seu celular' })).toBeVisible()
  await hydrated(page)
  await expectAccessible(page, 'cadastro: celular')

  // Etapa 2 (celular): os celulares de teste de supabase/config.toml; os já usados são recusados e o próximo é tentado.
  let sent = false
  for (const phone of TEST_PHONES) {
    await tabTo(page, page.getByLabel(/Celular/))
    await page.keyboard.press('Control+A')
    await page.keyboard.type(phone)
    // Espera a resposta de cada tentativa: a mensagem "já está em uso" da tentativa anterior continua na tela até lá.
    await Promise.all([page.waitForResponse((response) => response.request().method() === 'POST' && response.url().includes('/cadastro')), page.keyboard.press('Enter')])
    const code = page.getByRole('heading', { name: 'Digite o código' })
    const taken = page.getByText('Este celular já está em uso por outra conta.')
    await expect(code.or(taken)).toBeVisible()
    if (await code.isVisible()) {
      sent = true
      break
    }
  }
  expect(sent, 'sem celular de teste livre: rode `supabase db reset` e recarregue as seeds').toBe(true)
  await hydrated(page)
  await expectAccessible(page, 'cadastro: código do SMS')
  // Código errado: erro ligado ao campo (3.3.1) e foco nele; depois o certo.
  await typeInto(page, page.getByLabel(/Código do SMS/), '000000')
  await page.keyboard.press('Enter')
  const wrong = page.getByLabel(/Código do SMS/)
  await expect(wrong).toHaveAttribute('aria-invalid', 'true')
  await expect(wrong).toBeFocused()
  await expectAccessible(page, 'cadastro: código recusado')
  await page.keyboard.press('Control+A')
  await page.keyboard.type(TEST_CODE)
  await page.keyboard.press('Enter')
  await expect(page.getByText('Seus dados', { exact: true })).toBeVisible()
  await hydrated(page)
  await expectAccessible(page, 'cadastro: dados')

  // Redundant entry (3.3.7): e-mail e celular confirmados aparecem como texto e não são pedidos de novo.
  await expect(page.getByText(email)).toBeVisible({ timeout: 15_000 })
  await expect(page.getByLabel(/E-mail/)).toHaveCount(0)
  await expect(page.getByLabel(/Celular/)).toHaveCount(0)

  // Envio vazio: erros por campo, foco no primeiro inválido.
  await tabTo(page, page.getByRole('button', { name: 'concluir cadastro ✓' }))
  await page.keyboard.press('Enter')
  const firstInvalid = page.locator('[aria-invalid="true"]').first()
  await expect(firstInvalid).toBeFocused()
  await expectAccessible(page, 'cadastro: dados com erros')

  // Preenchimento só por teclado, inclusive listas (digitar a opção), data, rádios e caixas de seleção.
  await typeInto(page, page.getByLabel(/Nome completo/), 'Pessoa de teste de acessibilidade')
  await typeInto(page, page.getByLabel(/Data de nascimento/), '20051990')
  await typeInto(page, page.getByLabel(/CPF/), cpf.replace(/\D/g, ''))
  await tabTo(page, page.getByLabel(/Estado/))
  await page.keyboard.type('Pernambuco')
  await expect(page.getByLabel(/Estado/)).toHaveValue('PE')
  await tabTo(page, page.getByLabel(/Cidade/))
  await page.keyboard.type('Recife')
  await expect(page.getByLabel(/Cidade/)).toHaveValue('Recife')
  await tabTo(page, page.getByRole('radio', { name: /Artista/ }))
  await page.keyboard.press('Space')
  await expect(page.getByRole('radio', { name: /Artista/ })).toBeChecked()
  await typeInto(page, page.getByLabel(/Nome da atuação/), `A11y ${Date.now().toString(36)}`)
  await tabTo(page, page.getByRole('checkbox', { name: 'techno', exact: true }))
  await page.keyboard.press('Space')
  await expect(page.getByRole('checkbox', { name: 'techno', exact: true })).toBeChecked()
  await expectAccessible(page, 'cadastro: dados preenchidos')
  await tabTo(page, page.getByRole('button', { name: 'concluir cadastro ✓' }))
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(/\/painel$/)
  await hydrated(page)
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  await expectAccessible(page, 'painel da conta recém-criada')
})

test('editar dados por teclado: salvar mostra a mensagem de estado e o valor volta ao original no fim', async ({ page }) => {
  await login(page, accounts.applicant.email)
  await open(page, '/painel/dados')
  const name = page.getByLabel(/Nome completo/)
  const original = await name.inputValue()
  const save = page.getByRole('button', { name: 'salvar dados' })
  try {
    await tabTo(page, name)
    await page.keyboard.press('End')
    await page.keyboard.type(' (teste)')
    await tabTo(page, save)
    await page.keyboard.press('Enter')
    const status = page.getByRole('status').first()
    await expect(status).toBeVisible()
    await expectAccessible(page, 'editar dados salvo')
    await expect(name).toHaveValue(`${original} (teste)`)
  } finally {
    await page.getByLabel(/Nome completo/).fill(original)
    await page.getByRole('button', { name: 'salvar dados' }).click()
    await expect(page.getByRole('status').first()).toBeVisible()
    await expect(page.getByLabel(/Nome completo/)).toHaveValue(original)
  }
})

test('criar evento por teclado (rascunho): campos, listas, datas e lineup sem mouse; o rascunho é cancelado ao final', async ({ page }) => {
  test.setTimeout(90_000)
  await login(page, accounts.active.email)
  await open(page, `/coletivo/${collective}/eventos/novo`)
  const name = `Festa A11y ${Date.now().toString(36)}`
  await typeInto(page, page.getByLabel(/Nome do evento/), name)
  await tabTo(page, page.getByLabel(/Vertente principal/))
  await page.keyboard.type('techno')
  await expect(page.getByLabel(/Vertente principal/)).toHaveValue('techno')
  // O ano aceita até seis dígitos: depois dele a seta para a direita passa para a hora.
  await typeInto(page, page.getByLabel(/Início \(Fortaleza\)/), '01032031')
  await page.keyboard.press('ArrowRight')
  await page.keyboard.type('0800')
  await tabTo(page, page.getByLabel(/Estado/))
  await page.keyboard.type('Pernambuco')
  await tabTo(page, page.getByLabel(/Cidade/))
  await page.keyboard.type('Recife')
  await typeInto(page, page.getByLabel(/^\$? ?Local/), 'Local de teste de acessibilidade')
  // Lineup só por teclado: nome livre + botão "+" (Enter) e remoção pelo botão da etiqueta.
  await typeInto(page, page.getByRole('textbox', { name: 'Nome livre', exact: true }), 'Atração livre')
  await tabTo(page, page.getByRole('button', { name: 'Adicionar nome livre ao lineup' }))
  await page.keyboard.press('Enter')
  await expect(page.getByRole('button', { name: /remover Atração livre/ })).toBeVisible()
  await tabTo(page, page.getByRole('checkbox', { name: 'Evento gratuito' }))
  await page.keyboard.press('Space')
  await expectAccessible(page, 'novo evento preenchido')
  await tabTo(page, page.getByRole('button', { name: 'salvar rascunho' }))
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(new RegExp(`/coletivo/${collective}/eventos/[0-9a-f-]{36}$`))
  await hydrated(page)
  const eventId = page.url().split('/').pop()!
  try {
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    await expectAccessible(page, 'evento recém-criado (rascunho)')
  } finally {
    const row = await rpcAs<{ state: string; version: number }>(accounts.active.email, 'get_event', { target: eventId })
    if (row.state !== 'cancelled') await rpcAs(accounts.active.email, 'cancel_event', { target: eventId, expected_version: row.version })
  }
})

test('enviar mensagem pelo chat flutuante só por teclado: abrir, escrever, Enter envia, Esc minimiza; a leitura da outra conta é restaurada', async ({ page }) => {
  await login(page, accounts.member.email)
  await open(page, `/artistas/${activeProfile}`)
  const opener = page.getByRole('link', { name: 'Enviar mensagem', exact: true })
  await tabTo(page, opener)
  await page.keyboard.press('Enter')
  const dialog = page.getByRole('dialog', { name: /^Conversa com / })
  await expect(dialog).toBeVisible()
  const field = page.getByRole('textbox', { name: /^Mensagem para / })
  await expect(field).toBeFocused()
  const text = `Mensagem de teste de teclado ${Date.now().toString(36)}`
  await page.keyboard.type(text)
  // A conversa carrega em segundo plano: o botão só habilita (e o Enter só envia) com a conversa pronta.
  await expect(dialog.getByRole('button', { name: 'enviar', exact: true })).toBeEnabled()
  await page.keyboard.press('Enter')
  const log = dialog.getByRole('log')
  await expect(log.getByText(text, { exact: true })).toBeVisible()
  await expect(field).toHaveValue('')
  await expect(field).toBeFocused()
  await expectAccessible(page, 'chat flutuante com mensagem enviada')
  const walk = await focusWalk(page)
  expect(walk.problems.join(NL), 'chat com mensagem enviada: foco').toBe('')
  await tabTo(page, field)
  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)
  await expect(opener).toBeFocused()

  // A outra conta recebe uma não lida; restaura o que dashboard.spec.ts afirma.
  const conversations = await rpcAs<{ id: string; unread_count: number }[]>(accounts.active.email, 'list_conversations')
  for (const conversation of conversations.filter((item) => item.unread_count > 0)) {
    const messages = await rpcAs<{ id: string; body: string }[]>(accounts.active.email, 'get_recent_messages', { target: conversation.id })
    if (messages.some((message) => message.body === text))
      await rpcAs(accounts.active.email, 'mark_conversation_read', { target: conversation.id, last_message: messages[messages.length - 1].id })
  }
})
