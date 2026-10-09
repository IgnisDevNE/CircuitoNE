import { expect, test, type Page } from '@playwright/test'
import { rpcAs } from './rpc'
import { accounts, login } from './session'

// Criar coletivo/produtora (W18) contra o Supabase local. Este arquivo roda no projeto `collective-create` do
// playwright.db.config.ts, depois de todas as outras suítes: a conta usada (fixture-member, membro do coletivo 1) passa a
// ter um coletivo a mais, em análise, e nenhuma RPC apaga um coletivo que ainda não foi aprovado. Por isso é o último
// projeto; as suítes de leitura que afirmam os coletivos dessa conta (dashboard.spec, collective.spec) rodam antes.
// Num banco local reutilizado, recarregue as seeds antes de rodar a suíte de novo. O CI não tem aprovação automática
// (isso é só do ambiente de desenvolvimento): o coletivo criado fica "em análise".
const stamp = Date.now().toString(36)
const name = `Coletivo W18 ${stamp}`

let errors: string[]
test.beforeEach(({ page }) => {
  errors = []
  page.on('pageerror', (error) => errors.push(error.message))
})
test.afterEach(() => {
  expect(errors).toEqual([])
})
test.describe.configure({ mode: 'serial' })

/** O envio funciona sem JavaScript, mas os testes esperam a hidratação para não competir com ela. */
const hydrated = (page: Page) =>
  expect
    .poll(() => page.locator('main form').first().evaluate((form) => Object.keys(form).some((key) => key.startsWith('__reactFiber'))))
    .toBe(true)

const field = (page: Page, key: string) => page.locator(`main [name="${key}"]`)
const kind = (page: Page, value: string) => page.locator(`main input[name="kind"][value="${value}"]`)
const panel = (page: Page, title: string) => page.getByRole('heading', { level: 2, name: title, exact: true }).locator('xpath=ancestor::section')

test('o formulário valida no servidor: tipo, campos obrigatórios e CNPJ da produtora, com o foco no primeiro erro', async ({ page }) => {
  await login(page, accounts.member.email)
  await page.goto('/painel/coletivos')
  await page.getByRole('link', { name: '+ criar coletivo/produtora' }).click()
  await expect(page).toHaveURL(/\/painel\/coletivos\/novo$/)
  await expect(page).toHaveTitle('Novo coletivo/produtora · CIRCUITO NE')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('$ novo_coletivo_produtora')
  await hydrated(page)

  // Nada preenchido: o tipo é o primeiro campo e recebe o foco.
  await page.getByRole('button', { name: 'criar', exact: true }).click()
  await expect(page.getByRole('alert').first()).toHaveText('[erro] Corrija os campos destacados.')
  await expect(page.getByText('[erro] Escolha se é um coletivo ou uma produtora.')).toBeVisible()
  await expect(page.getByText('[erro] Informe o nome.')).toBeVisible()
  await expect(kind(page, 'collective')).toBeFocused()

  // Produtora sem CNPJ: o campo CNPJ passa a ser obrigatório e o erro aponta para ele.
  await kind(page, 'producer').check()
  await expect(field(page, 'cnpj')).toHaveAttribute('aria-required', 'true')
  await field(page, 'name').fill(name)
  await field(page, 'state_code').selectOption('PE')
  await field(page, 'city').selectOption('Recife')
  await field(page, 'activity').fill('Festas')
  await field(page, 'description').fill('Coletivo criado pelo teste de ponta a ponta.')
  await page.getByRole('button', { name: 'criar', exact: true }).click()
  await expect(page.getByText('[erro] Produtora exige CNPJ.')).toBeVisible()
  await expect(field(page, 'cnpj')).toBeFocused()
  // Nada foi criado.
  const before = await rpcAs<{ name: string }[]>(accounts.member.email, 'list_my_collectives')
  expect(before.some((c) => c.name === name)).toBe(false)
})

test('criar um coletivo: nasce em análise, aparece em "meus coletivos" e no painel, e não entra no catálogo público', async ({ page }) => {
  await login(page, accounts.member.email)
  await page.goto('/painel/coletivos/novo')
  await hydrated(page)
  await kind(page, 'collective').check()
  await field(page, 'name').fill(name)
  await field(page, 'state_code').selectOption('PE')
  await field(page, 'city').selectOption('Recife')
  await field(page, 'activity').fill('Festas')
  await field(page, 'description').fill('Coletivo criado pelo teste de ponta a ponta.')
  await field(page, 'instagram').fill('https://instagram.example.invalid/w18')
  await page.getByRole('button', { name: 'criar', exact: true }).click()

  await expect(page).toHaveURL(/\/painel\/coletivos\?criado=1$/)
  await expect(page.getByRole('status')).toContainText('em análise')
  const card = page.getByRole('list', { name: 'Meus coletivos' }).getByRole('listitem').filter({ hasText: name })
  await expect(card).toContainText('Recife/PE')
  await expect(card).toContainText('em análise')
  await expect(card).toContainText('responsável')
  await expect(card.getByRole('link', { name: 'ver situação →' })).toHaveAttribute('href', /\/coletivo\/[0-9a-f-]{36}\/painel$/)

  // O banco guarda o que foi enviado, com a conta como proprietária.
  const mine = await rpcAs<{ id: string; name: string; kind: string; state: string; is_owner: boolean; city: string; state_code: string }[]>(accounts.member.email, 'list_my_collectives')
  expect(mine.filter((c) => c.name === name)).toEqual([
    expect.objectContaining({ kind: 'collective', state: 'pending', is_owner: true, city: 'Recife', state_code: 'PE' }),
  ])

  // O painel também lista o coletivo, com a situação.
  await page.goto('/painel')
  await expect(panel(page, 'meus coletivos').locator('li').filter({ hasText: name })).toContainText('em análise')

  // Em análise não é público.
  await page.goto('/coletivos')
  await expect(page.getByRole('heading', { level: 3, name })).toHaveCount(0)
})
