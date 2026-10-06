import { expect, test, type Page } from '@playwright/test'
import { accounts } from './session'

// Cadastro real (W5) contra o Supabase local: e-mail, celular com código de teste, dados e primeira atuação.
// Roda no projeto `register` (playwright.db.config.ts), depois dos demais specs. Não altera as fixtures: cada execução cria
// contas com e-mail e CPF próprios. Localmente o Auth não envia e-mail (supabase/config.toml: enable_confirmations = false)
// nem SMS: os celulares de [auth.sms.test_otp] recebem o código fixo abaixo. Cada celular de teste só serve a uma conta;
// numa base local reaproveitada, os usados são pulados e, se acabarem, `supabase db reset` repõe (e recarregue as seeds).
const TEST_CODE = '123456'
const TEST_PHONES = Array.from({ length: 8 }, (_, index) => `81 99990-000${index + 1}`)
const PASSWORD = 'senha-de-teste-123'
// CPF e celular das fixtures (seed identity): servem para testar duplicidade.
const FIXTURE_CPF = '529.982.247-25'
const FIXTURE_PHONE = '81 99900-0001'

let errors: string[]
test.beforeEach(({ page }) => {
  errors = []
  page.on('pageerror', (error) => errors.push(error.message))
})
test.afterEach(() => {
  expect(errors).toEqual([])
})

let counter = 0
const uniqueEmail = () => `registro-${Date.now().toString(36)}-${(counter += 1)}@example.invalid`

/** CPF válido aleatório (dígitos verificadores calculados), nunca igual ao das fixtures na prática. */
function validCpf(): string {
  const base = Array.from({ length: 9 }, () => Math.floor(Math.random() * 10))
  if (base.every((digit) => digit === base[0])) base[8] = (base[8] + 1) % 10
  const check = (digits: number[]) => ((digits.reduce((sum, digit, index) => sum + digit * (digits.length + 1 - index), 0) * 10) % 11) % 10
  const first = check(base)
  const second = check([...base, first])
  const all = [...base, first, second].join('')
  return `${all.slice(0, 3)}.${all.slice(3, 6)}.${all.slice(6, 9)}-${all.slice(9)}`
}

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

async function createAccount(page: Page, email: string) {
  await open(page, '/cadastro')
  await page.getByLabel(/E-mail/).fill(email)
  await page.locator('input[name="senha"]').fill(PASSWORD)
  await page.locator('input[name="conf"]').fill(PASSWORD)
  await page.getByRole('button', { name: 'criar conta' }).click()
  await expect(page.getByRole('heading', { name: 'Confirme seu celular' })).toBeVisible()
}

/** Tenta os celulares de teste até um aceitar o envio (os já usados por contas de execuções anteriores são recusados). */
async function claimPhone(page: Page): Promise<string> {
  for (const phone of TEST_PHONES) {
    await page.getByLabel(/Celular/).fill(phone)
    await page.getByRole('button', { name: 'enviar código por SMS' }).click()
    const code = page.getByRole('heading', { name: 'Digite o código' })
    const taken = page.getByText('Este celular já está em uso por outra conta.')
    await expect(code.or(taken)).toBeVisible()
    if (await code.isVisible()) return phone
  }
  throw new Error('Sem celular de teste livre: rode `supabase db reset`, recarregue as seeds e repita.')
}

async function confirmPhone(page: Page) {
  await page.getByLabel(/Código do SMS/).fill(TEST_CODE)
  await page.getByRole('button', { name: 'confirmar celular' }).click()
  await expect(page.getByText('Seus dados', { exact: true })).toBeVisible()
}

async function fillData(page: Page, fields: { name: string; cpf: string; birth?: string; kind: RegExp; profile: string; style?: string }) {
  await hydrated(page)
  await page.getByLabel(/Nome completo/).fill(fields.name)
  await page.getByLabel(/Data de nascimento/).fill(fields.birth ?? '1990-05-20')
  await page.getByLabel(/CPF/).fill(fields.cpf)
  await page.getByLabel(/Cidade/).fill('Recife')
  await page.getByLabel(/Estado/).selectOption('PE')
  await page.getByRole('radio', { name: fields.kind }).check()
  await page.getByLabel(/Nome da atuação/).fill(fields.profile)
  if (fields.style) await page.getByRole('checkbox', { name: fields.style, exact: true }).check()
}

test('cadastro completo: e-mail, celular, dados e atuação até o painel, com retomada a cada recarga', async ({ page }) => {
  const email = uniqueEmail()
  const profile = `Projeto de teste ${Date.now().toString(36)}`
  const cpf = validCpf()

  // Etapa 1: conta. Sem confirmação de e-mail no Supabase local, segue direto para o celular.
  const response = await open(page, '/cadastro')
  expect(response?.status()).toBe(200)
  expect(response?.headers()['cache-control']).toContain('no-store')
  await expect(page).toHaveTitle('Cadastro · CIRCUITO NE')
  await expect(page.getByRole('heading', { name: 'novo_cadastro' })).toBeVisible()
  await createAccount(page, email)

  // Recarregar mantém a etapa (celular), pela sessão e pelo estado real do Auth.
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Confirme seu celular' })).toBeVisible()
  // Conta incompleta: o painel avisa e leva de volta ao cadastro.
  await page.goto('/painel')
  await page.getByRole('link', { name: 'Continuar cadastro' }).click()
  await expect(page).toHaveURL(/\/cadastro$/)
  await expect(page.getByRole('heading', { name: 'Confirme seu celular' })).toBeVisible()

  // Etapa 2: celular. Com o envio pendente, recarregar volta para o código.
  await hydrated(page)
  await claimPhone(page)
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Digite o código' })).toBeVisible()
  await hydrated(page)

  // Código errado: erro no campo, sem avançar; depois o certo.
  await page.getByLabel(/Código do SMS/).fill('000000')
  await page.getByRole('button', { name: 'confirmar celular' }).click()
  await expect(page.getByText(/Código inválido ou expirado/)).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Digite o código' })).toBeVisible()
  await confirmPhone(page)

  // Etapa 3: recarregar mantém os dados; CPF de outra conta é recusado sem dizer de quem, e o digitado fica.
  await page.reload()
  await expect(page.getByText('Seus dados', { exact: true })).toBeVisible()
  await fillData(page, { name: 'Pessoa de teste', cpf: FIXTURE_CPF, kind: /Artista/, profile, style: 'techno' })
  await page.getByRole('button', { name: /concluir cadastro/ }).click()
  await expect(page.getByText(/concluir o cadastro com este CPF/)).toBeVisible()
  await expect(page).toHaveURL(/\/cadastro$/)
  await expect(page.getByLabel(/Nome completo/)).toHaveValue('Pessoa de teste')
  await expect(page.getByLabel(/CPF/)).toHaveValue(FIXTURE_CPF)
  await expect(page.getByRole('radio', { name: /Artista/ })).toBeChecked()
  await expect(page.getByRole('checkbox', { name: 'techno', exact: true })).toBeChecked()

  // Menor de idade: erro de validação no campo, sem chamar o banco.
  await page.getByLabel(/Data de nascimento/).fill('2015-01-01')
  await page.getByRole('button', { name: /concluir cadastro/ }).click()
  await expect(page.getByText('É necessário ter 18 anos completos.')).toBeVisible()

  // CPF próprio válido: conclui e cai no painel, com a atuação criada.
  await page.getByLabel(/Data de nascimento/).fill('1990-05-20')
  await page.getByLabel(/CPF/).fill(cpf)
  await page.getByRole('button', { name: /concluir cadastro/ }).click()
  await expect(page).toHaveURL(/\/painel$/)
  await page.goto('/painel/dados')
  await expect(page.getByText(profile).first()).toBeVisible()
  await expect(page.getByText('Pessoa de teste').first()).toBeVisible()

  // Cadastro concluído: /cadastro vai para o painel.
  await page.goto('/cadastro')
  await expect(page).toHaveURL(/\/painel$/)

  // Nova atuação: mais uma, do tipo serviços.
  await open(page, '/painel/dados/nova-atuacao')
  await expect(page).toHaveTitle('Nova atuação · CIRCUITO NE')
  await page.getByRole('button', { name: 'criar atuação' }).click()
  await expect(page.getByText('Escolha o tipo de atuação.')).toBeVisible()
  await page.getByRole('radio', { name: /Serviços/ }).check()
  await page.getByLabel(/Nome da atuação/).fill('Som e luz de teste')
  await page.getByRole('button', { name: 'criar atuação' }).click()
  await expect(page).toHaveURL(/\/painel\/perfil\/[0-9a-f-]{36}$/)
  await page.goto('/painel/dados')
  await expect(page.getByText('Som e luz de teste').first()).toBeVisible()
  await expect(page.getByText(profile).first()).toBeVisible()
})

test('celular de outra conta e celular fixo são recusados; conta duplicada e painel levam ao cadastro', async ({ page }) => {
  // E-mail de uma conta existente: erro no campo (o Auth local não confirma e-mail).
  await open(page, '/cadastro')
  await page.getByLabel(/E-mail/).fill(accounts.active.email)
  await page.locator('input[name="senha"]').fill(PASSWORD)
  await page.locator('input[name="conf"]').fill(PASSWORD)
  await page.getByRole('button', { name: 'criar conta' }).click()
  await expect(page.getByText(/Este e-mail já tem cadastro/)).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Confirme seu celular' })).toHaveCount(0)

  // Senha curta e confirmação diferente: validação no servidor, sem criar nada.
  await page.getByLabel(/E-mail/).fill(uniqueEmail())
  await page.locator('input[name="senha"]').fill('curta')
  await page.locator('input[name="conf"]').fill('outra')
  await page.getByRole('button', { name: 'criar conta' }).click()
  await expect(page.getByText('Use ao menos 8 caracteres.')).toBeVisible()
  await expect(page.getByText('As senhas não coincidem.')).toBeVisible()

  // Conta nova: celular que já é de outra conta, e celular fixo.
  await createAccount(page, uniqueEmail())
  await hydrated(page)
  await page.getByLabel(/Celular/).fill(FIXTURE_PHONE)
  await page.getByRole('button', { name: 'enviar código por SMS' }).click()
  await expect(page.getByText('Este celular já está em uso por outra conta.')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Confirme seu celular' })).toBeVisible()
  await page.getByLabel(/Celular/).fill('81 3333-4444')
  await page.getByRole('button', { name: 'enviar código por SMS' }).click()
  await expect(page.getByText(/celular brasileiro com DDD/)).toBeVisible()

  // Sem o código não há avanço: o cadastro continua incompleto e o painel só mostra o aviso.
  await page.goto('/painel/dados')
  await expect(page.getByRole('link', { name: 'Continuar cadastro' })).toBeVisible()
  await expect(page.getByRole('navigation', { name: 'Painel' })).toHaveCount(0)
})

test('link de confirmação inválido volta ao cadastro com o aviso e o reenvio do e-mail', async ({ page }) => {
  for (const path of ['/auth/confirmar', '/auth/confirmar?token_hash=nao-existe&type=signup', '/auth/confirmar?code=nao-existe']) {
    await page.goto(path)
    await expect(page).toHaveURL(/\/cadastro\?confirmacao=(invalida|indisponivel)$/)
    await expect(page.getByRole('alert').first()).toContainText(/link de confirmação é inválido|Não foi possível confirmar/)
    await expect(page.getByLabel(/Reenviar para o e-mail/)).toBeVisible()
  }
  // Tipos que não confirmam cadastro nunca chegam a verificar nada.
  await page.goto('/auth/confirmar?token_hash=abc&type=recovery')
  await expect(page).toHaveURL(/confirmacao=invalida$/)
})

test('ações do cadastro recusam origem externa e corpo inválido', async ({ page, baseURL }) => {
  const external = await page.request.post(`${baseURL}/cadastro`, {
    headers: { origin: 'https://atacante.invalid', 'content-type': 'application/x-www-form-urlencoded' },
    data: 'intent=signup&email=a%40example.invalid',
  })
  expect(external.status()).toBe(403)
  const json = await page.request.post(`${baseURL}/cadastro`, {
    headers: { origin: baseURL!, 'content-type': 'application/json' },
    data: '{}',
  })
  expect(json.status()).toBe(415)
  const unknown = await page.request.post(`${baseURL}/cadastro`, {
    headers: { origin: baseURL!, 'content-type': 'application/x-www-form-urlencoded' },
    data: 'intent=apagar-tudo',
  })
  expect(unknown.status()).toBe(400)
})
