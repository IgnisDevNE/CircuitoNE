import { expect, test, type Page } from '@playwright/test'
import { artist, collective, conversation, expectNoViolations, hydrated, settleAnimations } from './a11y'
import { controlBorderFailures, textContrastFailures } from './a11y-checks'
import { focusWalk, reflowFailures } from './a11y-layout'
import { accounts, login, openPanelMenu, openPublicMenu, publicNav, submitLogin } from './session'

// Cada teste percorre várias páginas ou estados com o axe: o padrão de 30 s não basta no runner do CI.
test.describe.configure({ timeout: 180_000 })

// Estados da interface (W16), nos dois tamanhos de tela dos projetos de leitura: formulários com erro de validação, menus
// recolhidos abertos, listas vazias, trechos expansíveis abertos, editor de markdown, lineup e o chat flutuante aberto e
// minimizado. Nada aqui grava dados: os envios são sempre inválidos (a validação do servidor os recusa) e abrir a janela do
// chat não cria conversa (ela nasce no primeiro envio). Os estados que gravam (MFA, cadastro) ficam em a11y-write.spec.ts.

let errors: string[]
test.beforeEach(({ page }) => {
  errors = []
  page.on('pageerror', (error) => errors.push(error.message))
})
test.afterEach(() => {
  expect(errors).toEqual([])
})

/** Axe + contraste calculado + contornos, no estado em que a página está. */
async function expectAccessible(page: Page, label: string) {
  await settleAnimations(page)
  await expectNoViolations(page, label)
  const failures = [...(await textContrastFailures(page)), ...(await controlBorderFailures(page))]
  expect.soft(failures.join('\n'), `${label}: contraste`).toBe('')
}

async function open(page: Page, path: string) {
  await page.goto(path)
  await hydrated(page)
}

/** Envio inválido: o foco vai para o primeiro campo inválido (se houver) e o estado de erro é auditado. */
async function submitInvalid(page: Page, button: string | RegExp, label: string, options: { invalidField?: boolean } = {}) {
  await page.getByRole('button', { name: button }).click()
  const alert = page.getByRole('alert').first()
  const invalid = page.locator('[aria-invalid="true"]').first()
  await expect(invalid.or(alert).first()).toBeVisible()
  if (options.invalidField !== false) {
    await expect(invalid).toBeVisible()
    await expect(invalid).toBeFocused()
    // O erro precisa estar ligado ao campo: o foco anuncia o rótulo e a mensagem (3.3.1).
    const described = await invalid.getAttribute('aria-describedby')
    expect(described, `${label}: campo inválido sem aria-describedby`).toBeTruthy()
    await expect(page.locator(`[id="${described!.split(' ')[0]}"]`)).toContainText(/\S/)
  }
  await expectAccessible(page, label)
}

test('formulários públicos com erro: cadastro vazio e entrada com senha errada', async ({ page }) => {
  await open(page, '/cadastro')
  await submitInvalid(page, 'criar conta', 'cadastro com erros')
  // O reenvio de e-mail fica num trecho expansível: aberto também é auditado.
  await page.locator('summary', { hasText: 'Já criou a conta' }).click()
  await expectAccessible(page, 'cadastro com o reenvio de e-mail aberto')

  await open(page, '/entrar')
  await page.getByLabel('E-mail').fill(accounts.active.email)
  await page.getByLabel('Senha').fill('senha-errada-qualquer')
  await page.getByRole('button', { name: 'Entrar', exact: true }).click()
  await expect(page.getByRole('alert')).toHaveText('E-mail ou senha inválidos.')
  await expectAccessible(page, 'entrar com senha errada')
})

test('formulários do painel com erro de validação (nenhum dado é gravado)', async ({ page }) => {
  await login(page, accounts.active.email)

  await open(page, '/painel/dados/nova-atuacao')
  await submitInvalid(page, 'criar atuação', 'nova atuação com erros')

  await open(page, '/painel/dados')
  await page.getByLabel(/Nome completo/).fill('')
  await submitInvalid(page, 'salvar dados', 'editar dados com erro')

  await open(page, `/painel/perfil/${artist}`)
  await page.getByLabel(/^\$? ?Nome/).first().fill('')
  await submitInvalid(page, 'salvar perfil', 'editar perfil com erro')

  await open(page, '/painel/seguranca')
  await submitInvalid(page, 'enviar confirmação', 'segurança: novo e-mail vazio')
  await submitInvalid(page, 'alterar senha', 'segurança: senha vazia')
  // Exclusão da conta: a confirmação digitada errada é recusada antes de qualquer efeito.
  await page.getByLabel(/Digite .* para confirmar/).fill('errado')
  await submitInvalid(page, 'solicitar exclusão da conta', 'segurança: confirmação de exclusão errada')

  await open(page, `/coletivo/${collective}/eventos/novo`)
  await submitInvalid(page, 'salvar rascunho', 'novo evento com erros')
})

test('menus recolhidos abertos (celular) e seus atalhos de teclado', async ({ page }) => {
  await open(page, '/')
  await openPublicMenu(page)
  await expectAccessible(page, 'menu público aberto')
  const toggle = page.getByRole('button', { name: /(Abrir|Fechar) menu/ })
  if (await toggle.isVisible()) {
    // Esc fecha e o foco continua no botão (nada de armadilha de teclado, 2.1.2).
    await page.keyboard.press('Escape')
    await expect(toggle).toHaveAttribute('aria-expanded', 'false')
  }
  await login(page, accounts.active.email)
  await openPanelMenu(page)
  await expectAccessible(page, 'menu do painel aberto')
  const panelToggle = page.getByRole('button', { name: 'Menu do painel' })
  if (await panelToggle.isVisible()) {
    await expect(panelToggle).toHaveAttribute('aria-expanded', 'true')
    await page.keyboard.press('Escape')
    await expect(panelToggle).toHaveAttribute('aria-expanded', 'false')
  }
})

test('listas vazias e trechos expansíveis', async ({ page }) => {
  await open(page, '/artistas')
  await page.getByLabel('Buscar').fill('zzzz-ninguem')
  await expect(page.getByText('Nenhum artista encontrado para os filtros atuais.')).toBeVisible()
  await expectAccessible(page, 'artistas sem resultado')

  await login(page, accounts.active.email)
  await open(page, '/painel/explorar/artistas')
  await page.getByLabel('Buscar').fill('zzzz-ninguem')
  await expect(page.getByText('Nenhuma atuação encontrada para os filtros atuais.')).toBeVisible()
  await expect(page.getByRole('status')).toContainText(/^0 de \d+$/)
  await expectAccessible(page, 'explorar sem resultado')

  // Subestilos e denúncia ficam em `details`: abertos também passam.
  await open(page, `/painel/perfil/${artist}`)
  for (const summary of await page.locator('summary').all()) await summary.click()
  await expectAccessible(page, 'perfil com subestilos abertos')
  await open(page, `/painel/mensagens/${conversation}`)
  for (const summary of await page.locator('summary').all()) await summary.click()
  await expectAccessible(page, 'conversa com a denúncia aberta')
})

test('editor de markdown e lineup do evento (sem salvar)', async ({ page }) => {
  await login(page, accounts.active.email)
  await open(page, `/coletivo/${collective}/eventos/novo`)
  await page.locator('textarea[name="description"]').fill('# Título\n\n## Subtítulo\n\nTexto com **negrito**, *itálico* e [um link](https://example.com).\n\n- item um\n- item dois')
  await expect(page.getByRole('heading', { name: 'Título', exact: true })).toBeVisible()
  await page.getByRole('textbox', { name: 'Nome livre', exact: true }).fill('Atração sem vínculo')
  await page.getByRole('button', { name: 'Adicionar nome livre ao lineup' }).click()
  await expect(page.getByRole('button', { name: /remover Atração sem vínculo/ })).toBeVisible()
  // O aviso falado do lineup (4.1.3) vem de uma região viva que já existe na página.
  await expect(page.locator('p[aria-live="polite"]')).toContainText('Atração sem vínculo adicionado ao lineup. 1 no total.')
  await expectAccessible(page, 'evento com markdown e lineup')
})

// ----- Chat flutuante: aberto e minimizado, nos dois tamanhos de tela --------------------------------------------------------

const dock = (page: Page) => page.getByRole('dialog', { name: /^Conversa com / })

async function auditDock(page: Page, path: string) {
  await open(page, path)
  const opener = page.getByRole('link', { name: 'Enviar mensagem', exact: true }).first()
  await opener.click()
  await expect(dock(page)).toBeVisible()
  const field = page.getByRole('textbox', { name: /^Mensagem para / })
  await expect(field).toBeFocused()
  await expect(page.getByRole('log')).toBeVisible()
  await expectAccessible(page, `${path} com o chat aberto`)

  // Teclado: Tab percorre a janela e a página; nada fica sob a janela (2.4.11) e o foco sai dela sem prender (2.1.2).
  const walk = await focusWalk(page)
  expect(walk.problems.join('\n'), `${path} com o chat aberto: foco`).toBe('')
  expect(walk.labels.some((label) => label.startsWith('textarea')), 'o campo de mensagem entra na ordem do foco').toBe(true)
  expect(await reflowFailures(page)).toEqual([])

  // Esc minimiza e devolve o foco ao botão que abriu; a barra minimizada também passa.
  await field.focus()
  await page.keyboard.press('Escape')
  await expect(dock(page)).toHaveCount(0)
  await expect(opener).toBeFocused()
  const bar = page.getByRole('button', { name: /^Abrir conversa com / })
  await expect(bar).toHaveAttribute('aria-expanded', 'false')
  await expectAccessible(page, `${path} com o chat minimizado`)
  const minimized = await focusWalk(page)
  expect(minimized.problems.join('\n'), `${path} com o chat minimizado: foco`).toBe('')

  // Reabrir pela barra devolve o foco ao campo; fechar remove a barra.
  await bar.click()
  await expect(dock(page)).toBeVisible()
  await expect(field).toBeFocused()
  await dock(page).getByRole('button', { name: /^Fechar conversa com / }).click()
  await expect(dock(page)).toHaveCount(0)
  await expect(page.getByRole('button', { name: /^Abrir conversa com / })).toHaveCount(0)
}

test('chat flutuante em página pública, aberto e minimizado: sem violações, foco no campo, nada escondido sob a janela e sem armadilha de teclado', async ({ page }) => {
  await login(page, accounts.member.email)
  await auditDock(page, `/artistas/${artist}`)
})

test('chat flutuante no catálogo interno do painel, aberto e minimizado', async ({ page }) => {
  await login(page, accounts.member.email)
  await auditDock(page, '/painel/explorar/artistas')
})

test('chat flutuante: enviar pelo teclado, mensagem de estado e janela ao navegar (sem enviar nada)', async ({ page }) => {
  await login(page, accounts.member.email)
  await open(page, `/artistas/${artist}`)
  await page.getByRole('link', { name: 'Enviar mensagem', exact: true }).click()
  const field = page.getByRole('textbox', { name: /^Mensagem para / })
  await expect(field).toBeFocused()
  // O botão "enviar" só habilita com texto; a dica de teclado está ligada ao campo (aria-describedby).
  await expect(page.getByRole('button', { name: 'enviar', exact: true })).toBeDisabled()
  await expect(field).toHaveAccessibleDescription(/Enter envia/)
  await field.fill('rascunho que não será enviado')
  await expect(page.getByRole('button', { name: 'enviar', exact: true })).toBeEnabled()
  await field.fill('')
  // A janela segue a navegação sem perder o foco lógico: o título (h1) da nova página recebe o foco, como sem a janela.
  await openPublicMenu(page)
  await publicNav(page).getByRole('link', { name: 'Eventos', exact: true }).click()
  await expect(page).toHaveURL(/\/eventos$/)
  await expect(dock(page)).toBeVisible()
  await expect(page.getByRole('heading', { level: 1 })).toBeFocused()
})

test('painel lateral do evento aberto no dashboard: sem violações, foco no botão de fechar, fundo inerte e a página de trás não rola', async ({ page }) => {
  await login(page, accounts.active.email)
  await hydrated(page)
  const link = page.getByRole('heading', { level: 2, name: 'próximos eventos' }).locator('xpath=ancestor::section').getByRole('link').first()
  await link.click()
  const sheet = page.getByRole('dialog')
  await expect(sheet).toBeVisible()
  await expect(sheet.getByRole('heading', { level: 2 }).first()).toBeVisible()
  await expect(sheet.getByRole('status')).toHaveText('')
  // Diálogo modal: o foco começa no botão de fechar e o resto da página fica inerte (sem "armadilha" para leitor de tela).
  await expect(sheet.getByRole('button', { name: 'fechar' })).toBeFocused()
  await expect(page.locator('body')).toHaveCSS('overflow', 'hidden')
  await expectAccessible(page, 'painel lateral do evento aberto')
  // Um Tab a partir do botão de fechar fica dentro do painel (o link "abrir página do evento" vem logo depois).
  await page.keyboard.press('Tab')
  await expect(sheet.getByRole('link', { name: 'abrir página do evento ↗' })).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(sheet).toHaveCount(0)
  await expect(link).toBeFocused()
  await expect(page.locator('body')).not.toHaveCSS('overflow', 'hidden')
})

test('login por teclado: e-mail e senha aceitam colar e gerenciador de senhas (3.3.8) e o Enter envia', async ({ page }) => {
  await open(page, '/entrar')
  const email = page.getByLabel('E-mail')
  const password = page.getByLabel('Senha')
  // Sem teste cognitivo: nada impede colar nem preencher automaticamente; os campos declaram o propósito (1.3.5).
  await expect(email).toHaveAttribute('autocomplete', 'email')
  await expect(password).toHaveAttribute('autocomplete', 'current-password')
  await expect(password).toHaveAttribute('type', 'password')
  const blocked = await page.evaluate(() => {
    const blockedBy = (name: string) => {
      const target = document.querySelector<HTMLInputElement>(`input[name="${name}"]`)!
      const event = new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: new DataTransfer() })
      target.dispatchEvent(event)
      return event.defaultPrevented
    }
    return [blockedBy('email'), blockedBy('password')]
  })
  expect(blocked).toEqual([false, false])
  await submitLogin(page, accounts.active.email)
  await expect(page).toHaveURL(/\/painel$/)
})
