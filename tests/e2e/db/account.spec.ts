import { expect, test, type Page } from '@playwright/test'
import { accounts, login, openPanelMenu, panelNav, fixturePassword } from './session'
import { totp, totpWindow } from './totp'

// Edição da conta (W6) contra o Supabase local. Estas escritas rodam nos projetos `account-*` do playwright.db.config.ts,
// depois dos demais specs e uma tela por vez: cada teste desfaz o que alterou.
// Fixtures: fixture-active (dados da conta e artista 02..01 publicado, Recife/PE, descrição "Fixture, sem dados reais",
// estilo techno), fixture-member (artista 02..08; usada para senha, MFA e e-mail), fixture-suspended e fixture-deletion.
const activeArtist = '02000000-0000-4000-8000-000000000001'
const memberArtist = '02000000-0000-4000-8000-000000000008'
const suspendedArtist = '02000000-0000-4000-8000-000000000005'
const unknownProfile = '02000000-0000-4000-8000-0000000000ff'
const ORIGINAL_NAME = accounts.active.name

let errors: string[]
test.beforeEach(({ page }) => {
  errors = []
  page.on('pageerror', (error) => errors.push(error.message))
})
test.afterEach(() => {
  expect(errors).toEqual([])
})

/** Os formulários funcionam sem JavaScript, mas os testes esperam a hidratação para não competir com ela. */
const hydrated = (page: Page) =>
  expect
    .poll(() => page.locator('main form').first().evaluate((form) => Object.keys(form).some((key) => key.startsWith('__reactFiber'))))
    .toBe(true)

const open = async (page: Page, path: string) => {
  const response = await page.goto(path)
  await hydrated(page)
  return response
}
const status = (page: Page) => page.getByRole('status')
// Selos de estilo do próprio artista: os eventos listados na página (links) também mostram a vertente do evento (W13).
const artistStyle = (page: Page, style: string) => page.locator(`xpath=//main//*[text()='${style}'][not(ancestor::a)]`)

async function saveAccount(page: Page, fields: { name: string; city: string; state: string; gender: string; whatsapp: 'same' | 'other'; number?: string }) {
  await page.getByRole('textbox', { name: /Nome completo/ }).fill(fields.name)
  await page.getByRole('combobox', { name: /Gênero/ }).selectOption(fields.gender)
  // UF primeiro: a lista de cidades é a do estado escolhido.
  await page.getByRole('combobox', { name: /Estado/ }).selectOption(fields.state)
  await page.getByRole('combobox', { name: /Cidade/ }).selectOption(fields.city)
  await page.getByRole('radio', { name: fields.whatsapp === 'same' ? /celular também é WhatsApp/ : /é outro número/ }).check()
  if (fields.number) await page.getByLabel(/Número do WhatsApp/).fill(fields.number)
  await page.getByRole('button', { name: 'salvar dados' }).click()
}

test('dados da conta: edita, persiste ao recarregar e atualiza o menu; CPF e nascimento não são editáveis', async ({ page }) => {
  await login(page, accounts.active.email)
  const response = await open(page, '/painel/dados')
  expect(response?.status()).toBe(200)
  expect(response?.headers()['cache-control']).toContain('no-store')
  await expect(page).toHaveTitle('Editar Dados · CIRCUITO NE')
  await expect(page.getByText('***.982.247-**')).toBeVisible()
  await expect(page.getByText('01/01/1990')).toBeVisible()
  await expect(page.getByText(accounts.active.email)).toBeVisible()
  await expect(page.getByText('+55 (81) 99900-0001')).toBeVisible()
  await expect(page.getByRole('link', { name: 'solicitar correção ao suporte' })).toHaveAttribute('href', /^mailto:ignisdev@magalz\.space/)
  for (const fixed of [/CPF/, /nascimento/i, /E-mail/, /Celular/]) await expect(page.getByRole('textbox', { name: fixed })).toHaveCount(0)

  try {
    await saveAccount(page, { name: 'Pessoa sintética editada', city: 'João Pessoa', state: 'PB', gender: 'Não binário', whatsapp: 'other', number: '81 98888-7777' })
    await expect(status(page)).toHaveText('Dados atualizados.')

    await page.reload()
    await hydrated(page)
    await expect(page.getByRole('textbox', { name: /Nome completo/ })).toHaveValue('Pessoa sintética editada')
    await expect(page.getByRole('combobox', { name: /Gênero/ })).toHaveValue('Não binário')
    await expect(page.getByRole('combobox', { name: /Cidade/ })).toHaveValue('João Pessoa')
    await expect(page.getByRole('combobox', { name: /Estado/ })).toHaveValue('PB')
    await expect(page.getByRole('radio', { name: /é outro número/ })).toBeChecked()
    await expect(page.getByLabel(/Número do WhatsApp/)).toHaveValue('+5581988887777')
    await expect(page.getByText('***.982.247-**')).toBeVisible()
    await openPanelMenu(page)
    await expect(panelNav(page).getByText('Pessoa sintética editada', { exact: true })).toBeVisible()
  } finally {
    await open(page, '/painel/dados')
    await saveAccount(page, { name: ORIGINAL_NAME, city: 'Recife', state: 'PE', gender: '', whatsapp: 'same' })
    await expect(status(page)).toHaveText('Dados atualizados.')
  }
  await page.reload()
  await openPanelMenu(page)
  await expect(panelNav(page).getByText(ORIGINAL_NAME, { exact: true })).toBeVisible()
})

test('dados da conta: erros aparecem junto dos campos, nada é salvo e não há sucesso falso', async ({ page }) => {
  await login(page, accounts.active.email)
  await open(page, '/painel/dados')
  await page.getByRole('combobox', { name: /Cidade/ }).selectOption('')
  await page.getByRole('radio', { name: /é outro número/ }).check()
  await page.getByLabel(/Número do WhatsApp/).fill('123')
  await page.getByRole('button', { name: 'salvar dados' }).click()
  await expect(page.getByText('[erro] Escolha a cidade.')).toBeVisible()
  await expect(page.getByText(/\[erro\] Informe um número válido/)).toBeVisible()
  await expect(status(page)).toHaveCount(0)
  await page.reload()
  await expect(page.getByRole('combobox', { name: /Cidade/ })).toHaveValue('Recife')
  await expect(page.getByRole('radio', { name: /celular também é WhatsApp/ })).toBeChecked()
})

test('dados da conta: gênero opcional com as três opções; UF primeiro e depois a cidade da lista (IBGE)', async ({ page }) => {
  await login(page, accounts.active.email)
  await open(page, '/painel/dados')
  const gender = page.getByRole('combobox', { name: /Gênero/ })
  await expect(gender.locator('option')).toHaveText(['Prefiro não informar', 'Masculino', 'Feminino', 'Não binário'])
  await expect(gender).toHaveValue('')
  const state = page.getByRole('combobox', { name: /Estado/ })
  const city = page.getByRole('combobox', { name: /Cidade/ })
  await expect(city).toHaveValue('Recife')
  await expect(city.locator('option[value="Olinda"]')).toHaveCount(1)
  await expect(city.locator('option[value="Juazeiro do Norte"]')).toHaveCount(0)
  await state.selectOption('CE')
  // Trocar a UF limpa a cidade e troca a lista.
  await expect(city).toHaveValue('')
  await expect(city.locator('option[value="Juazeiro do Norte"]')).toHaveCount(1)
  await expect(city.locator('option[value="Olinda"]')).toHaveCount(0)
  // Nada é salvo sem a cidade; recarregar mantém os dados do banco.
  await page.getByRole('button', { name: 'salvar dados' }).click()
  await expect(page.getByText('[erro] Escolha a cidade.')).toBeVisible()
  await expect(status(page)).toHaveCount(0)
  await page.reload()
  await expect(state).toHaveValue('PE')
  await expect(city).toHaveValue('Recife')
})

test('sem JavaScript: o servidor recusa cidade de outra UF e a página volta com a lista da UF escolhida', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false })
  const page = await context.newPage()
  try {
    await login(page, accounts.active.email)
    await page.goto('/painel/dados')
    const city = page.getByRole('combobox', { name: /Cidade/ })
    await expect(city).toHaveValue('Recife')
    // Sem JavaScript a lista segue a do estado inicial (PE): trocar a UF e enviar é uma ida ao servidor, que recusa o par.
    await page.getByRole('combobox', { name: /Estado/ }).selectOption('CE')
    await page.getByRole('button', { name: 'salvar dados' }).click()
    await expect(page.getByText('[erro] Escolha uma cidade de CE da lista.')).toBeVisible()
    await expect(page.getByRole('combobox', { name: /Estado/ })).toHaveValue('CE')
    await expect(city.locator('option[value="Juazeiro do Norte"]')).toHaveCount(1)
    // Nada foi salvo: a conta continua em Recife/PE.
    await page.goto('/painel/dados')
    await expect(page.getByRole('combobox', { name: /Estado/ })).toHaveValue('PE')
    await expect(city).toHaveValue('Recife')
  } finally {
    await context.close()
  }
})

test('POST de origem externa é recusado e não altera a conta', async ({ page }) => {
  await login(page, accounts.active.email)
  const response = await page.request.post('/painel/dados', {
    headers: { origin: 'https://attacker.invalid' },
    form: { intent: 'save-account', nome: 'Invasor', cidade: 'Lugar nenhum', estado: 'PE', whatsapp: 'same' },
  })
  expect([400, 403]).toContain(response.status())
  await open(page, '/painel/dados')
  await expect(page.getByRole('textbox', { name: /Nome completo/ })).toHaveValue(ORIGINAL_NAME)
  await expect(page.getByRole('combobox', { name: /Cidade/ })).toHaveValue('Recife')
})

test('minhas atuações levam à edição de cada uma', async ({ page }) => {
  await login(page, accounts.active.email)
  await open(page, '/painel/dados')
  const list = page.getByRole('heading', { name: 'minhas atuações' }).locator('xpath=ancestor::section[1]')
  await expect(list.getByRole('listitem')).toHaveCount(4)
  await expect(list.getByRole('listitem').filter({ hasText: 'Serviços sintéticos' })).toContainText('Serviços')
  await list.getByRole('listitem').filter({ hasText: 'Serviços sintéticos' }).getByRole('link', { name: 'editar perfil' }).click()
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Serviços sintéticos')
  await expect(page.getByLabel(/Tipo de serviço/)).toBeVisible()
  await expect(page.getByRole('checkbox', { name: /Perfil público/ })).toHaveCount(0)
})

test('perfil de artista: a edição aparece na página pública e é desfeita ao final', async ({ page, context }) => {
  await login(page, accounts.active.email)
  const response = await open(page, `/painel/perfil/${activeArtist}`)
  expect(response?.status()).toBe(200)
  await expect(page).toHaveTitle('Editar Artista sintético público · CIRCUITO NE')
  await expect(page.getByRole('textbox', { name: /Bio/ })).toHaveValue('Fixture, sem dados reais')
  await expect(page.getByRole('checkbox', { name: 'techno', exact: true })).toBeChecked()
  await expect(page.getByRole('checkbox', { name: 'house', exact: true })).not.toBeChecked()
  await expect(page.getByRole('checkbox', { name: /Perfil público/ })).toBeChecked()

  const bio = page.getByRole('textbox', { name: /Bio/ })
  const city = page.getByRole('combobox', { name: /Cidade/ })
  const house = page.getByRole('checkbox', { name: 'house', exact: true })
  const instagram = page.getByLabel(/Instagram/)
  try {
    await bio.fill('Bio editada pelo e2e')
    await city.selectOption('Olinda')
    await house.check()
    await instagram.fill('https://instagram.com/artista.sintetico')
    await page.getByRole('button', { name: 'salvar perfil' }).click()
    await expect(status(page)).toHaveText('Perfil atualizado.')

    // Visitante: a página pública reflete a edição.
    await context.clearCookies()
    await page.goto(`/artistas/${activeArtist}`)
    await expect(page.getByRole('heading', { level: 1, name: 'Artista sintético público' })).toBeVisible()
    await expect(page.getByText('Bio editada pelo e2e')).toBeVisible()
    await expect(page.getByText('Olinda/PE', { exact: true })).toBeVisible()
    await expect(artistStyle(page, 'techno')).toBeVisible()
    await expect(artistStyle(page, 'house')).toBeVisible()
    await expect(page.getByRole('link', { name: /instagram/i })).toHaveAttribute('href', 'https://instagram.com/artista.sintetico')
  } finally {
    await login(page, accounts.active.email)
    await open(page, `/painel/perfil/${activeArtist}`)
    await bio.fill('Fixture, sem dados reais')
    await city.selectOption('Recife')
    if (await house.isChecked()) await house.uncheck()
    await instagram.fill('')
    await page.getByRole('button', { name: 'salvar perfil' }).click()
    await expect(status(page)).toHaveText('Perfil atualizado.')
  }
  await context.clearCookies()
  await page.goto(`/artistas/${activeArtist}`)
  await expect(page.getByText('Fixture, sem dados reais', { exact: true })).toBeVisible()
  await expect(page.getByText('Recife/PE', { exact: true })).toBeVisible()
  await expect(artistStyle(page, 'house')).toHaveCount(0)
})

test('perfil de artista: despublicar tira da página pública; estilos e nome inválidos não salvam', async ({ page, context }) => {
  await login(page, accounts.active.email)
  await open(page, `/painel/perfil/${activeArtist}`)
  // Sem nenhum estilo e sem nome: erros por campo, nada muda.
  await page.getByRole('textbox', { name: /Nome artístico/ }).fill('')
  await page.getByRole('checkbox', { name: 'techno', exact: true }).uncheck()
  await page.getByRole('button', { name: 'salvar perfil' }).click()
  await expect(page.getByText('[erro] Informe o nome da atuação.')).toBeVisible()
  await expect(page.getByText('[erro] Escolha ao menos um estilo.')).toBeVisible()
  await expect(status(page)).toHaveCount(0)

  try {
    await open(page, `/painel/perfil/${activeArtist}`)
    await page.getByRole('checkbox', { name: /Perfil público/ }).uncheck()
    await page.getByRole('button', { name: 'salvar perfil' }).click()
    await expect(status(page)).toHaveText('Perfil atualizado.')
    await context.clearCookies()
    const hidden = await page.goto(`/artistas/${activeArtist}`)
    expect(hidden?.status()).toBe(404)
  } finally {
    await login(page, accounts.active.email)
    await open(page, `/painel/perfil/${activeArtist}`)
    await page.getByRole('checkbox', { name: /Perfil público/ }).check()
    await page.getByRole('button', { name: 'salvar perfil' }).click()
    await expect(status(page)).toHaveText('Perfil atualizado.')
  }
  await context.clearCookies()
  expect((await page.goto(`/artistas/${activeArtist}`))?.status()).toBe(200)
})

test('dados profissionais do artista: cachê em reais persiste e nunca aparece na página pública', async ({ page, context }) => {
  await login(page, accounts.active.email)
  await open(page, `/painel/perfil/${activeArtist}`)
  const professional = page.getByRole('heading', { name: 'dados profissionais' }).locator('xpath=ancestor::section[1]')
  const booking = professional.getByLabel(/E-mail de booking/)
  const fee = professional.getByLabel(/Média de cachê/)
  try {
    await booking.fill('booking@example.invalid')
    await fee.fill('1500,5')
    await professional.getByLabel(/Telefone de contato/).fill('81 97777-6666')
    await professional.getByRole('button', { name: 'salvar dados profissionais' }).click()
    await expect(professional.getByRole('status')).toHaveText('Dados profissionais atualizados.')

    await page.reload()
    await hydrated(page)
    await expect(booking).toHaveValue('booking@example.invalid')
    await expect(fee).toHaveValue('R$ 1.500,50')
    await expect(professional.getByLabel(/Telefone de contato/)).toHaveValue('+5581977776666')

    await context.clearCookies()
    const publicPage = await page.goto(`/artistas/${activeArtist}`)
    expect(await publicPage!.text()).not.toMatch(/booking@example|R\$ 1\.500|fee_cents|\+5581977776666/)
  } finally {
    await login(page, accounts.active.email)
    await open(page, `/painel/perfil/${activeArtist}`)
    await booking.fill('')
    await fee.fill('')
    await professional.getByLabel(/Telefone de contato/).fill('')
    await professional.getByRole('button', { name: 'salvar dados profissionais' }).click()
    await expect(professional.getByRole('status')).toHaveText('Dados profissionais atualizados.')
  }
})

test('dados profissionais: erros por campo sem salvar', async ({ page }) => {
  await login(page, accounts.active.email)
  await open(page, `/painel/perfil/${activeArtist}`)
  const professional = page.getByRole('heading', { name: 'dados profissionais' }).locator('xpath=ancestor::section[1]')
  await professional.getByLabel(/E-mail de booking/).fill('sem-arroba')
  await professional.getByLabel(/Média de cachê/).fill('1.50')
  await professional.getByLabel(/Presskit/).fill('presskit.pdf')
  await professional.getByRole('button', { name: 'salvar dados profissionais' }).click()
  await expect(professional.getByText('[erro] Informe um e-mail válido.')).toBeVisible()
  await expect(professional.getByText(/\[erro\] Informe um valor em reais/)).toBeVisible()
  await expect(professional.getByText(/\[erro\] Informe o endereço completo/)).toBeVisible()
  await expect(status(page)).toHaveCount(0)
})

test('excluir atuação exige a confirmação digitada (nada é excluído sem ela)', async ({ page }) => {
  await login(page, accounts.active.email)
  await open(page, `/painel/perfil/${activeArtist}`)
  await page.getByLabel(/Digite EXCLUIR para confirmar/).fill('excluir')
  await page.getByRole('button', { name: 'excluir atuação' }).click()
  await expect(page.getByText('[erro] Digite EXCLUIR para confirmar.')).toBeVisible()
  expect((await page.goto(`/painel/perfil/${activeArtist}`))?.status()).toBe(200)
})

test('atuação de outra conta, inexistente ou com id inválido responde 404 sem formulário', async ({ page }) => {
  await login(page, accounts.member.email)
  const own = await open(page, `/painel/perfil/${memberArtist}`)
  expect(own?.status()).toBe(200)
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Artista sintético do membro')
  for (const id of [activeArtist, unknownProfile, 'nao-e-uuid']) {
    const response = await page.goto(`/painel/perfil/${id}`)
    expect(response?.status()).toBe(404)
    await expect(page.getByText('Atuação não encontrada.')).toBeVisible()
    await expect(page.getByRole('textbox')).toHaveCount(0)
    await expect(page.getByRole('link', { name: 'voltar aos dados' })).toBeVisible()
  }
})

for (const [label, account, notice, profile] of [
  ['suspensa', accounts.suspended, 'Conta suspensa para revisão.', suspendedArtist],
  ['com exclusão em análise', accounts.deletion, 'A exclusão da sua conta está em análise.', '02000000-0000-4000-8000-000000000006'],
] as const) {
  test(`conta ${label}: as páginas de edição mostram só o aviso, sem formulário nem 404`, async ({ page }) => {
    await login(page, account.email)
    for (const path of ['/painel/dados', '/painel/seguranca', `/painel/perfil/${profile}`]) {
      const response = await page.goto(path)
      expect(response?.status()).toBe(200)
      await expect(page.getByText(notice)).toBeVisible()
      await expect(page.getByRole('textbox')).toHaveCount(0)
      await expect(page.getByRole('navigation', { name: 'Painel' })).toHaveCount(0)
    }
  })
}

/** Painel da página de segurança (cada um tem o próprio campo "Senha atual": e-mail, senha e exclusão). */
const securityPanel = (page: Page, title: string) => page.locator('section', { has: page.getByRole('heading', { level: 2, name: title, exact: true }) })

test('senha: atual errada é recusada pelo Auth e a sessão continua válida', async ({ page }) => {
  await login(page, accounts.member.email)
  await open(page, '/painel/seguranca')
  const passwordPanel = securityPanel(page, 'alterar senha')
  await passwordPanel.getByLabel(/Senha atual/).fill('senha-errada-qualquer')
  await page.getByLabel(/Nova senha/).fill('nova-senha-segura-123')
  await page.getByLabel(/Confirmar nova senha/).fill('nova-senha-segura-123')
  await page.getByRole('button', { name: 'alterar senha' }).click()
  await expect(page.getByText('[erro] Senha atual incorreta.')).toBeVisible()
  await expect(status(page)).toHaveCount(0)
  // Nenhuma senha mudou: o login com a senha de teste continua valendo e a sessão não foi perdida.
  await page.goto('/painel')
  await expect(page).toHaveURL(/\/painel$/)
  await expect(page.getByRole('heading', { level: 1 })).toContainText('olá, Membro')
})

test('senha e e-mail: validações locais antes de qualquer chamada ao Auth', async ({ page }) => {
  await login(page, accounts.member.email)
  await open(page, '/painel/seguranca')
  await securityPanel(page, 'alterar senha').getByLabel(/Senha atual/).fill(fixturePassword)
  await page.getByLabel(/Nova senha/).fill('curta')
  await page.getByLabel(/Confirmar nova senha/).fill('outra')
  await page.getByRole('button', { name: 'alterar senha' }).click()
  await expect(page.getByText('[erro] Use ao menos 8 caracteres.')).toBeVisible()
  await expect(page.getByText('[erro] As senhas não coincidem.')).toBeVisible()
  await expect(status(page)).toHaveCount(0)

  await expect(page.getByText(accounts.member.email, { exact: true })).toBeVisible()
  const emailPanel = securityPanel(page, 'alterar e-mail')
  await emailPanel.getByLabel(/Senha atual/).fill(fixturePassword)
  await page.getByLabel(/Novo e-mail/).fill('sem-arroba')
  await page.getByRole('button', { name: 'enviar confirmação' }).click()
  await expect(page.getByText('[erro] Informe um e-mail válido.')).toBeVisible()
  await page.getByLabel(/Novo e-mail/).fill(accounts.member.email.toUpperCase())
  await emailPanel.getByLabel(/Senha atual/).fill(fixturePassword)
  await page.getByRole('button', { name: 'enviar confirmação' }).click()
  await expect(page.getByText('[erro] Este já é o e-mail da conta.')).toBeVisible()
  await expect(status(page)).toHaveCount(0)
})

test('e-mail: trocar exige a senha atual (vazia ou errada é recusada, e o e-mail da conta não muda)', async ({ page }) => {
  await login(page, accounts.member.email)
  await open(page, '/painel/seguranca')
  const emailPanel = securityPanel(page, 'alterar e-mail')
  await emailPanel.getByLabel(/Novo e-mail/).fill('troca-sem-senha@example.invalid')
  await page.getByRole('button', { name: 'enviar confirmação' }).click()
  await expect(emailPanel.getByText('[erro] Informe a senha atual.')).toBeVisible()
  // O e-mail digitado volta ao campo; a senha nunca volta.
  await expect(emailPanel.getByLabel(/Novo e-mail/)).toHaveValue('troca-sem-senha@example.invalid')
  await expect(emailPanel.getByLabel(/Senha atual/)).toHaveValue('')
  await emailPanel.getByLabel(/Senha atual/).fill('senha-errada-qualquer')
  await page.getByRole('button', { name: 'enviar confirmação' }).click()
  await expect(emailPanel.getByText('[erro] Senha atual incorreta.')).toBeVisible()
  await expect(status(page)).toHaveCount(0)
  // Nada foi pedido ao Auth: não há e-mail pendente de confirmação.
  await page.goto('/painel/seguranca')
  await expect(page.getByText(/Aguardando confirmação do novo e-mail/)).toHaveCount(0)
})

test('exclusão da conta exige a confirmação digitada; sem ela a conta continua ativa', async ({ page }) => {
  await login(page, accounts.member.email)
  await open(page, '/painel/seguranca')
  await page.getByLabel(/Digite EXCLUIR MINHA CONTA/).fill('excluir')
  await page.getByRole('button', { name: 'solicitar exclusão da conta' }).click()
  await expect(page.getByText('[erro] Digite EXCLUIR MINHA CONTA para confirmar.')).toBeVisible()
  await expect(page.getByText('[erro] Informe a senha atual.')).toBeVisible()
  // Confirmação certa, mas senha errada: a exclusão também é recusada.
  const deletion = securityPanel(page, 'excluir conta')
  await deletion.getByLabel(/Digite EXCLUIR MINHA CONTA/).fill('EXCLUIR MINHA CONTA')
  await deletion.getByLabel(/Senha atual/).fill('senha-errada-qualquer')
  await page.getByRole('button', { name: 'solicitar exclusão da conta' }).click()
  await expect(deletion.getByText('[erro] Senha atual incorreta.')).toBeVisible()
  await page.goto('/painel')
  await expect(page.getByRole('heading', { level: 1 })).toContainText('olá, Membro')
  await expect(page.getByText('A exclusão da sua conta está em análise.')).toHaveCount(0)
})

test('MFA TOTP: mostra QR e chave, recusa código errado, ativa com o código do segredo e remove', async ({ page }) => {
  test.setTimeout(120_000)
  await login(page, accounts.member.email)
  await open(page, '/painel/seguranca')
  await expect(page.getByText('Desativada.', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'configurar aplicativo autenticador' }).click()
  const secretElement = page.getByTestId('mfa-secret')
  await expect(secretElement).toBeVisible()
  await expect(page.getByRole('img', { name: /QR code/ })).toBeVisible()
  const secret = (await secretElement.textContent())!.trim()
  expect(secret).toMatch(/^[A-Z2-7]{16,}$/)

  let active = false
  try {
    // Código errado: erro no campo e a chave continua na tela para uma nova tentativa.
    await page.getByLabel(/Código do aplicativo/).fill('000000')
    await page.getByRole('button', { name: 'ativar' }).click()
    await expect(page.getByText(/\[erro\] Código inválido ou expirado/)).toBeVisible()
    await expect(secretElement).toHaveText(secret)
    await expect(page.getByRole('img', { name: /QR code/ })).toBeVisible()

    await page.getByLabel(/Código do aplicativo/).fill(totp(secret))
    await page.getByRole('button', { name: 'ativar' }).click()
    active = true
    await expect(status(page)).toHaveText('Autenticação em dois fatores ativada.')
    await expect(page.getByText('Ativada.', { exact: true })).toBeVisible()
    await expect(page.getByTestId('mfa-secret')).toHaveCount(0)

    // A sessão que ativou o MFA já está no segundo nível: nada a confirmar após recarregar.
    await page.reload()
    await expect(page.getByText('Ativada.', { exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'confirmar sessão' })).toHaveCount(0)

    // O mesmo código não é reaproveitado: espera a próxima janela de 30 s.
    const window = totpWindow()
    await expect.poll(() => totpWindow(), { timeout: 40_000 }).toBeGreaterThan(window)
    await page.getByLabel(/Código para remover/).fill(totp(secret))
    await page.getByRole('button', { name: 'remover autenticação em dois fatores' }).click()
    await expect(status(page)).toHaveText('Autenticação em dois fatores removida.')
    active = false
    await expect(page.getByText('Desativada.', { exact: true })).toBeVisible()
  } finally {
    if (active) {
      const window = totpWindow()
      await expect.poll(() => totpWindow(), { timeout: 40_000 }).toBeGreaterThan(window)
      await open(page, '/painel/seguranca')
      await page.getByLabel(/Código para remover/).fill(totp(secret))
      await page.getByRole('button', { name: 'remover autenticação em dois fatores' }).click()
      await expect(status(page)).toHaveText('Autenticação em dois fatores removida.')
    }
  }
})

test('cancelar o cadastro do autenticador não ativa nada', async ({ page }) => {
  await login(page, accounts.member.email)
  await open(page, '/painel/seguranca')
  await page.getByRole('button', { name: 'configurar aplicativo autenticador' }).click()
  await expect(page.getByTestId('mfa-secret')).toBeVisible()
  await page.getByRole('button', { name: 'cancelar' }).click()
  await expect(status(page)).toHaveText('Cadastro cancelado.')
  await expect(page.getByText('Desativada.', { exact: true })).toBeVisible()
  await page.reload()
  await expect(page.getByText('Desativada.', { exact: true })).toBeVisible()
})
