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

test('páginas públicas: sem violações WCAG 2.2 A/AA (axe)', async ({ page }) => {
  for (const path of publicPaths) await visit(page, path)
})

test('páginas do painel e do coletivo: sem violações WCAG 2.2 A/AA (axe)', async ({ page }) => {
  await login(page, accounts.active.email)
  for (const path of panelPaths) await visit(page, path)
})

test('páginas públicas em outros estados (evento cancelado, adiado, encerrado; coletivo produtor; não encontrado): sem violações', async ({ page }) => {
  for (const path of publicStatePaths) await visit(page, path)
})

test('painel em outros estados (atuações de serviços e audiovisual, coletivos pendente, suspenso, recusado e encerrado, eventos em rascunho e cancelado): sem violações', async ({ page }) => {
  await login(page, accounts.active.email)
  for (const path of panelStatePaths) await visit(page, path)
})

test('outras contas e papéis: integrante com permissões, candidato, conta suspensa, em exclusão e sem cadastro concluído', async ({ page }) => {
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
