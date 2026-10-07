import { expect, test } from '@playwright/test'
import { collective, expectNoViolations, hydrated, panelPaths, panelStatePaths, publicPaths, publicStatePaths } from './a11y'
import { accounts, login, submitLogin } from './session'

// Auditoria de acessibilidade (W16): axe-core (WCAG 2.2 A/AA) em todas as rotas, nos dois tamanhos de tela dos projetos de
// leitura (desktop 1366 px e celular 390 px). Só lê dados: nenhuma fixture é alterada. Os estados que escrevem dados
// (chat flutuante, MFA, cadastro, modais de exclusão) ficam em a11y-states.spec.ts, nos projetos de escrita.
let errors: string[]
test.beforeEach(({ page }) => {
  errors = []
  page.on('pageerror', (error) => errors.push(error.message))
})
test.afterEach(() => {
  expect(errors).toEqual([])
})

async function visit(page: import('@playwright/test').Page, path: string) {
  await page.goto(path)
  await hydrated(page)
  await expectNoViolations(page, path)
}

// Um teste por rota: cada página roda o axe em paralelo e cabe no limite de tempo por teste, também no runner do CI.
for (const path of publicPaths)
  test(`pública ${path}: sem violações WCAG 2.2 A/AA (axe)`, async ({ page }) => {
    await visit(page, path)
  })

for (const path of panelPaths)
  test(`painel ${path}: sem violações WCAG 2.2 A/AA (axe)`, async ({ page }) => {
    await login(page, accounts.active.email)
    await visit(page, path)
  })

for (const path of publicStatePaths)
  test(`pública em outro estado ${path}: sem violações`, async ({ page }) => {
    await visit(page, path)
  })

for (const path of panelStatePaths)
  test(`painel em outro estado ${path}: sem violações`, async ({ page }) => {
    await login(page, accounts.active.email)
    await visit(page, path)
  })

test('outras contas e papéis: integrante com permissões, candidato, conta suspensa, em exclusão e sem cadastro concluído', async ({ page }) => {
  // Várias contas e páginas em sequência: precisa de mais tempo que o padrão de 30 s no runner do CI.
  test.setTimeout(180_000)
  await login(page, accounts.member.email)
  for (const path of ['/painel', '/painel/coletivos', '/painel/mensagens', `/coletivo/${collective}/painel`, `/coletivo/${collective}/mensagens`, '/painel/explorar/coletivos']) await visit(page, path)
  await page.context().clearCookies()
  await login(page, accounts.applicant.email)
  for (const path of ['/painel', '/painel/coletivos', '/painel/mensagens', '/painel/dados']) await visit(page, path)
  // Contas restritas: o painel mostra o aviso no lugar do conteúdo (a sessão existe, mas a conta não está ativa).
  for (const account of [accounts.suspended, accounts.deletion]) {
    await page.context().clearCookies()
    await login(page, account.email)
    await hydrated(page)
    await expectNoViolations(page, `conta ${account.email}`)
    await page.goto('/painel/dados')
    await hydrated(page)
    await expectNoViolations(page, `conta ${account.email}: /painel/dados`)
  }
  // Conta sem confirmação de contatos: o Auth recusa o login e a página de entrada mostra o erro.
  await page.context().clearCookies()
  await submitLogin(page, accounts.unconfirmed.email)
  await expect(page.getByRole('alert')).toBeVisible()
  await hydrated(page)
  await expectNoViolations(page, 'entrar com erro de login')
})
