import { expect, test } from '@playwright/test'
import { accounts, login, openPanelMenu, openPublicMenu, panelNav, publicNav, submitLogin } from './session'

// Login real (Supabase Auth local) com as contas sintéticas de identity.sql/collectives.sql e a senha de teste de passwords.sql.
// Estados: ativa, suspensa (revisão), em exclusão e não confirmada. Fixtures sem perfil de login em `demo.sql` não são usadas.

let errors: string[]
test.beforeEach(({ page }) => {
  errors = []
  page.on('pageerror', (error) => errors.push(error.message))
})
test.afterEach(() => {
  expect(errors).toEqual([])
})

test('visitante em /painel e em páginas do painel é levado para /entrar', async ({ page }) => {
  for (const path of ['/painel', '/painel/dados', '/coletivo/05000000-0000-4000-8000-000000000001/painel']) {
    await page.goto(path)
    await expect(page).toHaveURL(/\/entrar$/)
    await expect(page.getByRole('heading', { level: 1, name: 'Entrar' })).toBeVisible()
  }
  // Nada do protótipo: sem botão de demonstração.
  await expect(page.getByRole('button', { name: /demo/i })).toHaveCount(0)
})

test('senha errada mostra o erro e não cria sessão', async ({ page }) => {
  await submitLogin(page, accounts.active.email, 'senha-errada-qualquer')
  await expect(page.getByRole('alert')).toHaveText('E-mail ou senha inválidos.')
  await expect(page).toHaveURL(/\/entrar$/)
  await page.goto('/painel')
  await expect(page).toHaveURL(/\/entrar$/)
  // Os cookies de Auth não existem: o cabeçalho público continua de visitante.
  await page.goto('/eventos')
  await openPublicMenu(page)
  await expect(publicNav(page).getByText('Entrar', { exact: true })).toBeVisible()
})

test('conta ativa entra no painel; resposta privada, sem cache, e o nome vem do banco', async ({ page }) => {
  await login(page, accounts.active.email)
  await expect(page).toHaveTitle('Dashboard · CIRCUITO NE')
  await expect(page.getByRole('heading', { level: 1 })).toContainText('olá, Pessoa')
  await openPanelMenu(page)
  await expect(panelNav(page).getByText(accounts.active.name, { exact: true })).toBeVisible()
  const response = await page.reload()
  expect(response?.status()).toBe(200)
  expect(response?.headers()['cache-control']).toContain('private, no-store')
  expect(response?.headers()['vary']).toContain('Cookie')
  // /entrar com sessão ativa volta para o painel.
  await page.goto('/entrar')
  await expect(page).toHaveURL(/\/painel$/)
})

test('sair encerra a sessão: o painel volta a exigir login e o cabeçalho volta a "Entrar"', async ({ page }) => {
  await login(page, accounts.active.email)
  await openPanelMenu(page)
  await page.getByRole('button', { name: '[→] Sair da sessão' }).click()
  await expect(page).toHaveURL(/\/entrar$/)
  await page.goto('/painel')
  await expect(page).toHaveURL(/\/entrar$/)
  await page.goto('/')
  await openPublicMenu(page)
  await expect(publicNav(page).getByText('Entrar', { exact: true })).toBeVisible()
})

test('cabeçalho público mostra "Painel" com sessão válida e leva ao painel', async ({ page }) => {
  await login(page, accounts.active.email)
  await page.goto('/eventos')
  await openPublicMenu(page)
  const painel = publicNav(page).getByText('Painel', { exact: true })
  await expect(painel).toBeVisible()
  await expect(publicNav(page).getByText('Entrar', { exact: true })).toHaveCount(0)
  await painel.click()
  await expect(page).toHaveURL(/\/painel$/)
})

test('conta suspensa vê só o aviso restrito, sem menus do painel', async ({ page }) => {
  await login(page, accounts.suspended.email)
  await expect(page.getByRole('heading', { level: 1, name: accounts.suspended.name })).toBeVisible()
  await expect(page.getByText('Conta suspensa para revisão.')).toBeVisible()
  await expect(page.getByRole('link', { name: 'Contatar suporte' })).toHaveAttribute('href', 'mailto:ignisdev@magalz.space')
  await expect(page.getByRole('navigation', { name: 'Painel' })).toHaveCount(0)
  await expect(page.getByRole('link', { name: /Mensagens|Coletivos|Explorar/ })).toHaveCount(0)
  // Rotas internas do painel também mostram só o aviso.
  await page.goto('/painel/mensagens')
  await expect(page.getByText('Conta suspensa para revisão.')).toBeVisible()
  await page.getByRole('button', { name: 'Sair', exact: true }).click()
  await expect(page).toHaveURL(/\/entrar$/)
})

test('conta com exclusão em análise vê o bloqueio das operações', async ({ page }) => {
  await login(page, accounts.deletion.email)
  await expect(page.getByText('A exclusão da sua conta está em análise.')).toBeVisible()
  await expect(page.getByRole('navigation', { name: 'Painel' })).toHaveCount(0)
})

test('conta sem confirmação de contatos não acessa o painel', async ({ page }) => {
  // O Auth recusa o login quando o e-mail não foi confirmado: nenhuma sessão é criada.
  await submitLogin(page, accounts.unconfirmed.email)
  await expect(page.getByRole('alert')).toBeVisible()
  await page.goto('/painel')
  await expect(page).toHaveURL(/\/entrar$/)
})
