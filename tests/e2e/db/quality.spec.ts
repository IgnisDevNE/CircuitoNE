import { expect, test, type Page } from '@playwright/test'
import { accounts, login } from './session'

// Qualidade transversal (W12), nos dois tamanhos de tela (desktop e celular 390 px): idioma, título, um único h1, imagens com
// alt, sem rolagem horizontal, `noindex` no PoC, navegação por teclado (pular para o conteúdo, foco ao trocar de página) e
// erros de formulário ligados aos campos. Só lê dados: nenhuma fixture é alterada.
const collective = '05000000-0000-4000-8000-000000000001'
const artist = '02000000-0000-4000-8000-000000000001'
const event = '0a000000-0000-4000-8000-000000000001'
const conversation = '0d000000-0000-4000-8000-000000000001'

const publicPaths = ['/', '/artistas', `/artistas/${artist}`, '/eventos', `/eventos/${event}`, '/coletivos', `/coletivos/${collective}`, '/entrar', '/cadastro']
const panelPaths = [
  '/painel',
  '/painel/dados',
  '/painel/dados/nova-atuacao',
  `/painel/perfil/${artist}`,
  '/painel/seguranca',
  '/painel/mensagens',
  `/painel/mensagens/nova?para=collective:${collective}`,
  '/painel/coletivos',
  '/painel/explorar/artistas',
  '/painel/explorar/servicos',
  '/painel/explorar/audiovisual',
  '/painel/explorar/coletivos',
  `/painel/mensagens/${conversation}`,
  `/coletivo/${collective}/painel`,
  `/coletivo/${collective}/solicitacoes`,
  `/coletivo/${collective}/eventos/novo`,
  `/coletivo/${collective}/eventos/${event}`,
  `/coletivo/${collective}/mensagens`,
  `/coletivo/${collective}/membros`,
  `/coletivo/${collective}/editar`,
  `/coletivo/${collective}/perfil`,
]

let errors: string[]
test.beforeEach(({ page }) => {
  errors = []
  page.on('pageerror', (error) => errors.push(error.message))
})
test.afterEach(() => {
  expect(errors).toEqual([])
})

/** As páginas funcionam sem JavaScript, mas os testes esperam a hidratação para não competir com ela. */
const hydrated = (page: Page) =>
  expect
    .poll(() => page.locator('main').first().evaluate((main) => Object.keys(main).some((key) => key.startsWith('__reactFiber'))))
    .toBe(true)

async function expectWellFormed(page: Page, path: string) {
  const response = await page.goto(path)
  expect(response?.status(), path).toBe(200)
  await expect(page.locator('html'), path).toHaveAttribute('lang', 'pt-BR')
  await expect(page, path).toHaveTitle(/ · CIRCUITO NE$/)
  await expect(page.locator('meta[name="robots"]'), path).toHaveAttribute('content', 'noindex, nofollow')
  // Um único h1 por página, e um `main` para o leitor de tela.
  await expect(page.getByRole('heading', { level: 1 }), path).toHaveCount(1)
  await expect(page.locator('main'), path).toHaveCount(1)
  // Toda imagem tem alt (vazio só para as decorativas).
  expect(await page.locator('img:not([alt])').count(), `${path}: imagens sem alt`).toBe(0)
  // Sem rolagem horizontal da página (390 px no celular).
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  expect(overflow, `${path}: rolagem horizontal`).toBeLessThanOrEqual(0)
}

test('páginas públicas: idioma, título, um h1, imagens com alt e sem rolagem horizontal', async ({ page }) => {
  for (const path of publicPaths) await expectWellFormed(page, path)
})

test('páginas do painel e do coletivo: idioma, título, um h1, imagens com alt e sem rolagem horizontal', async ({ page }) => {
  await login(page, accounts.active.email)
  for (const path of panelPaths) await expectWellFormed(page, path)
})

test('rota desconhecida mostra 404 com título e leva de volta ao início; URL malformada é recusada sem quebrar', async ({ page }) => {
  const missing = await page.goto('/rota-inexistente')
  expect(missing?.status()).toBe(404)
  await expect(page).toHaveTitle('Página não encontrada · CIRCUITO NE')
  await expect(page.getByRole('heading', { level: 1, name: '404 — página não encontrada.' })).toBeVisible()
  await page.getByRole('link', { name: 'voltar ao início', exact: true }).click()
  await expect(page).toHaveURL(/\/$/)
  await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1)
  // Escape inválido na URL: o servidor recusa (400) e a próxima navegação funciona.
  for (const path of ['/artistas/%E0%A4%A', '/painel/perfil/%E0%A4%A']) expect((await page.goto(path))?.status(), path).toBe(400)
  expect((await page.goto('/rota-inexistente'))?.status()).toBe(404)
})

test('teclado: o primeiro Tab leva ao link "Pular para o conteúdo", que move o foco para o conteúdo', async ({ page }) => {
  await page.goto('/eventos')
  await page.keyboard.press('Tab')
  const skip = page.getByRole('link', { name: 'Pular para o conteúdo' })
  await expect(skip).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(/#conteudo$/)
  await expect(page.locator('main#conteudo')).toBeFocused()
})

test('ao trocar de página no cliente o foco vai para o título (h1) da nova página', async ({ page }) => {
  await page.goto('/eventos')
  await hydrated(page)
  await page.getByRole('link', { name: `Capa do evento Evento sintético 1` }).click()
  await expect(page).toHaveURL(new RegExp(`/eventos/${event}$`))
  await expect(page.getByRole('heading', { level: 1, name: 'Evento sintético 1' })).toBeFocused()
})

test('formulário com erro: o campo inválido recebe o foco e aponta para a mensagem (aria-invalid, aria-describedby)', async ({ page }) => {
  await page.goto('/cadastro')
  await hydrated(page)
  await page.getByRole('button', { name: 'criar conta' }).click()
  const email = page.getByLabel(/E-mail/)
  await expect(email).toHaveAttribute('aria-invalid', 'true')
  await expect(email).toBeFocused()
  const described = await email.getAttribute('aria-describedby')
  expect(described).toBeTruthy()
  await expect(page.locator(`[id="${described}"]`)).toContainText('Informe um e-mail válido.')
  // O campo sem erro não é marcado como inválido.
  await expect(page.getByLabel(/E-mail/)).toHaveCount(1)
})

test('login com senha errada anuncia o erro e o liga ao formulário', async ({ page }) => {
  await page.goto('/entrar')
  await hydrated(page)
  await page.getByLabel('E-mail').fill(accounts.active.email)
  await page.getByLabel('Senha').fill('senha-errada-qualquer')
  await page.getByRole('button', { name: 'Entrar', exact: true }).click()
  const alert = page.getByRole('alert')
  await expect(alert).toHaveText('E-mail ou senha inválidos.')
  const id = await alert.getAttribute('id')
  await expect(page.locator('form')).toHaveAttribute('aria-describedby', id!)
  await expect(page.getByLabel('E-mail')).toHaveValue(accounts.active.email)
})
