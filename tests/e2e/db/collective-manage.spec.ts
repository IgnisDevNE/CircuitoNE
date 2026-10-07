import { expect, test, type BrowserContext, type Page } from '@playwright/test'
import { rpcAs } from './rpc'
import { accounts, login } from './session'

// Gestão do coletivo (W9) contra o Supabase local. Estas escritas rodam no projeto `collective-manage` do
// playwright.db.config.ts, depois das leituras e uma por vez; cada teste desfaz o que altera.
// Fixtures: fixture-active é dona do coletivo 1 (aprovado); fixture-member é membro dele com o perfil "Operações sintéticas"
// (as oito permissões delegáveis, nunca as do proprietário); fixture-applicant não pertence a nenhum coletivo
// (aqui entra como Membro comum e é removida ao final).
const C = '05000000-0000-4000-8000-000000000001'
const OPS_ROLE = '06000000-0000-4000-8000-000000000100'
const OWNER_ID = '01000000-0000-4000-8000-000000000001'
const MEMBER_ID = '01000000-0000-4000-8000-000000000005'
const APPLICANT_ID = '01000000-0000-4000-8000-000000000006'
const collectiveName = 'Organização sintética 1'
const stamp = Date.now().toString(36)
const roleName = `Produção W9 ${stamp}`

let errors: string[]
test.beforeEach(({ page }) => {
  errors = []
  page.on('pageerror', (error) => errors.push(error.message))
})
test.afterEach(() => {
  expect(errors).toEqual([])
})
test.describe.configure({ mode: 'serial' })

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
const field = (page: Page, key: string) => page.locator(`[name="${key}"]`).first()
const status = (page: Page) => page.getByRole('status')
const sectionNav = (page: Page) => page.getByRole('navigation', { name: 'Seções do coletivo' })
const sectionLabels = (page: Page) => sectionNav(page).getByRole('link').allTextContents()
const base = `/coletivo/${C}`

async function switchTo(page: Page, context: BrowserContext, email: string) {
  await context.clearCookies()
  await login(page, email)
}

type Status = { version: number; profile: { name: string; description: string } }
const collectiveStatus = () => rpcAs<Status>(accounts.active.email, 'get_collective_status', { target: C })
const roles = () => rpcAs<{ id: string; name: string; permissions: string[] }[]>(accounts.active.email, 'get_collective_roles', { target: C })

let original: Status | null = null
test.beforeAll(async () => {
  original = await collectiveStatus()
})

/** Nome, descrição, cor e redes de volta ao que as fixtures têm. */
async function restoreCollective() {
  const current = await collectiveStatus()
  await rpcAs(accounts.active.email, 'edit_collective', {
    target: C,
    expected_version: current.version,
    payload: { name: original?.profile.name, description: original?.profile.description, color: null, social_links: {} },
  })
}
// Os dois primeiros testes mudam o cadastro: cada um o restaura logo ao terminar, para os seguintes (e o título) partirem das fixtures.
test.afterEach(async ({}, testInfo) => {
  if (/^(o proprietário edita|perfil público)/.test(testInfo.title)) await restoreCollective()
})

// Garante o estado das fixtures, qualquer que seja o ponto em que um teste parou.
test.afterAll(async () => {
  const steps: (() => Promise<unknown>)[] = [
    restoreCollective,
    () => rpcAs(accounts.active.email, 'assign_collective_role', { target: C, member: MEMBER_ID, target_role: OPS_ROLE }),
    async () => {
      for (const role of (await roles()).filter((item) => item.name.startsWith('Produção W9'))) await rpcAs(accounts.active.email, 'delete_collective_role', { target: C, target_role: role.id })
    },
    () => rpcAs(accounts.active.email, 'remove_collective_member', { target: C, member: APPLICANT_ID }),
  ]
  for (const step of steps) {
    try {
      await step()
    } catch {
      // Limpeza de melhor esforço: cada passo desfaz uma coisa independente (o último falha se a candidata já saiu).
    }
  }
})

test('o proprietário edita o cadastro: validação por campo, página pública atualizada, conflito de versão e restauração', async ({ page }) => {
  const before = await collectiveStatus()
  const renamed = `${collectiveName} W9 ${stamp}`
  await login(page, accounts.active.email)
  const response = await open(page, `${base}/editar`)
  expect(response?.status()).toBe(200)
  expect(response?.headers()['cache-control']).toContain('no-store')
  await expect(page).toHaveTitle(`${collectiveName} · Editar · CIRCUITO NE`)
  await expect(field(page, 'name')).toHaveValue(collectiveName)
  await expect(page.getByText(`versão ${before.version}`)).toBeVisible()

  // Transferir a propriedade exige MFA (aal2): sem ela a tela explica e leva a Segurança.
  const transfer = page.getByRole('region', { name: 'Transferir a propriedade' })
  await expect(transfer).toContainText('ainda não tem a verificação em duas etapas')
  await expect(transfer.getByRole('link', { name: 'ir para Segurança' })).toHaveAttribute('href', '/painel/seguranca')
  await expect(transfer.getByRole('button', { name: 'transferir propriedade' })).toHaveCount(0)

  // Validação por campo: nada chega ao banco e o que foi digitado fica.
  await field(page, 'name').fill('')
  await field(page, 'description').fill('Descrição digitada que não pode sumir')
  await page.getByRole('button', { name: 'salvar', exact: true }).click()
  await expect(page.getByRole('alert')).toHaveText('[erro] Corrija os campos destacados.')
  await expect(page.getByText('[erro] Informe o nome.')).toBeVisible()
  await expect(field(page, 'description')).toHaveValue('Descrição digitada que não pode sumir')

  await field(page, 'name').fill(renamed)
  await field(page, 'description').fill('Descrição W9 com **texto**')
  await page.getByRole('button', { name: 'salvar', exact: true }).click()
  await expect(status(page)).toHaveText('Alterações salvas.')
  await expect(page.getByText(`versão ${before.version + 1}`)).toBeVisible()
  await expect(page.getByRole('heading', { level: 1, name: renamed })).toBeVisible()
  const publicPage = await page.goto(`/coletivos/${C}`)
  expect(publicPage?.status()).toBe(200)
  await expect(page.getByRole('heading', { level: 1, name: renamed })).toBeVisible()
  await expect(page.getByText('Descrição W9 com')).toBeVisible()

  // Conflito de versão: outra pessoa (o mesmo proprietário em outro lugar) salva primeiro.
  await open(page, `${base}/editar`)
  const current = await collectiveStatus()
  await rpcAs(accounts.active.email, 'edit_collective', { target: C, expected_version: current.version, payload: { name: `${collectiveName} concorrente ${stamp}` } })
  await field(page, 'name').fill('Meu nome perdido')
  await page.getByRole('button', { name: 'salvar', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('alterado por outra pessoa')
  await expect(field(page, 'name')).toHaveValue(`${collectiveName} concorrente ${stamp}`)
  await expect(page.getByText(`versão ${current.version + 1}`)).toBeVisible()
})

test('perfil público: salva redes e cor, a página pública reflete; endereço inválido é recusado por campo', async ({ page }) => {
  const instagram = `https://instagram.com/w9-${stamp}`
  await login(page, accounts.active.email)
  await open(page, `${base}/perfil`)
  await expect(page).toHaveTitle(`${collectiveName} · Perfil Público · CIRCUITO NE`)

  await field(page, 'instagram').fill('isto não é um endereço')
  await page.getByRole('button', { name: 'salvar', exact: true }).click()
  await expect(page.getByText('[erro] Informe o endereço completo, começando por https://')).toBeVisible()

  await field(page, 'instagram').fill(instagram)
  await page.getByLabel(/usar esta cor/).check()
  await field(page, 'color').fill('#00aa88')
  await page.getByRole('button', { name: 'salvar', exact: true }).click()
  await expect(status(page)).toHaveText('Perfil público atualizado.')
  await page.reload()
  await expect(field(page, 'instagram')).toHaveValue(instagram)
  await expect(field(page, 'color')).toHaveValue('#00aa88')
  await expect(page.getByLabel(/usar esta cor/)).toBeChecked()

  await page.goto(`/coletivos/${C}`)
  await expect(page.getByRole('link', { name: /Instagram/ })).toHaveAttribute('href', instagram)
})

test('pedido recusado ou em análise: o proprietário abre a correção dos dados; suspenso não abre a edição', async ({ page }) => {
  const other = (n: number) => `/coletivo/05000000-0000-4000-8000-${String(n).padStart(12, '0')}`
  await login(page, accounts.active.email)

  // Recusado (coletivo 4): o estado aparece com o atalho; a correção traz "reenviar" e nenhuma função interna.
  await page.goto(`${other(4)}/painel`)
  await expect(page.getByRole('heading', { level: 1, name: 'Organização sintética 4' })).toBeVisible()
  await expect(page.getByText('recusado', { exact: true })).toBeVisible()
  await page.getByRole('link', { name: 'corrigir os dados e reenviar' }).click()
  await expect(page).toHaveURL(new RegExp(`${other(4)}/editar$`))
  await hydrated(page)
  await expect(page).toHaveTitle('Organização sintética 4 · Editar · CIRCUITO NE')
  await expect(field(page, 'name')).toHaveValue('Organização sintética 4')
  await expect(page.getByRole('button', { name: 'salvar e reenviar para análise' })).toBeVisible()
  await expect(page.getByRole('heading', { level: 2, name: 'perfis de acesso' })).toHaveCount(0)
  await expect(page.getByRole('heading', { level: 2, name: 'zona de perigo' })).toHaveCount(0)
  await expect(sectionNav(page)).toHaveCount(0)

  // Em análise (coletivo 2): pode corrigir, mas não há o que reenviar.
  await open(page, `${other(2)}/editar`)
  await expect(page.getByRole('button', { name: 'salvar', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: /reenviar/ })).toHaveCount(0)

  // Suspenso (coletivo 3): só o estado, sem formulário nem atalho.
  await page.goto(`${other(3)}/editar`)
  await expect(page.getByText('suspenso', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'salvar', exact: true })).toHaveCount(0)
  await expect(page.getByRole('link', { name: /corrigir os dados/ })).toHaveCount(0)
})

test('perfis de acesso: cria, edita, atribui a um membro (vale na hora), reatribui e exclui', async ({ page, context }) => {
  await login(page, accounts.active.email)
  await open(page, `${base}/editar`)

  const list = page.getByRole('list', { name: 'Perfis de acesso' })
  await expect(list.getByRole('listitem').filter({ hasText: 'Membro' }).first()).toContainText('perfil inicial')
  await expect(list.getByRole('listitem').filter({ hasText: 'Operações sintéticas' })).toBeVisible()

  const createForm = page.locator('form', { has: page.getByRole('button', { name: '+ criar perfil' }) })
  await createForm.getByLabel('Nome do novo perfil').fill(roleName)
  await createForm.getByLabel('Criar eventos').check()
  await createForm.getByLabel('Ler mensagens do coletivo').check()
  await createForm.getByRole('button', { name: '+ criar perfil' }).click()
  await expect(status(page)).toContainText('Perfil criado.')
  const item = list.getByRole('listitem').filter({ hasText: roleName })
  await expect(item).toContainText('2 permissões')

  // Editar: acrescenta "enviar mensagens".
  await item.locator('summary').click()
  await item.getByLabel('Enviar mensagens pelo coletivo').check()
  await item.getByRole('button', { name: 'salvar perfil' }).click()
  await expect(status(page)).toContainText('Perfil atualizado.')
  await expect(list.getByRole('listitem').filter({ hasText: roleName })).toContainText('3 permissões')

  // Atribuir ao membro em Membros: o banco recebe o perfil e a tela mostra o resultado só depois.
  const created = (await roles()).find((role) => role.name === roleName)!
  expect(created.permissions).toEqual(['create_events', 'read_messages', 'send_messages'])
  await open(page, `${base}/membros`)
  const memberRow = page.getByRole('list', { name: 'Membros' }).getByRole('listitem').filter({ hasText: accounts.member.name })
  const select = page.getByRole('combobox', { name: `Perfil de acesso de ${accounts.member.name}` })
  await select.selectOption({ label: roleName })
  await page.getByRole('button', { name: `Atribuir perfil a ${accounts.member.name}` }).click()
  await expect(status(page)).toContainText('Perfil de acesso atribuído')
  await expect(select).toHaveValue(created.id)
  await expect(memberRow).toContainText(roleName)

  // A permissão vale na próxima operação, sem novo login: a conta do membro passa a ter só o que o perfil novo dá.
  await switchTo(page, context, accounts.member.email)
  await page.goto(`${base}/painel`)
  expect(await sectionLabels(page)).toEqual(['Dashboard', 'Mensagens', 'Criar Evento'])
  const denied = await page.goto(`${base}/solicitacoes`)
  expect(denied?.status()).toBe(403)

  // Reatribuir o perfil anterior e só então excluir o novo (com membros, o banco recusa).
  await switchTo(page, context, accounts.active.email)
  await open(page, `${base}/editar`)
  await page.getByRole('list', { name: 'Perfis de acesso' }).getByRole('listitem').filter({ hasText: roleName }).locator('summary').click()
  await page.getByRole('button', { name: `Excluir o perfil ${roleName}` }).click()
  await expect(page.getByRole('alert')).toContainText('Atribua outro perfil a eles antes de excluí-lo')
  await open(page, `${base}/membros`)
  await page.getByRole('combobox', { name: `Perfil de acesso de ${accounts.member.name}` }).selectOption({ label: 'Operações sintéticas' })
  await page.getByRole('button', { name: `Atribuir perfil a ${accounts.member.name}` }).click()
  await expect(status(page)).toContainText('Perfil de acesso atribuído')
  await open(page, `${base}/editar`)
  await page.getByRole('list', { name: 'Perfis de acesso' }).getByRole('listitem').filter({ hasText: roleName }).locator('summary').click()
  await page.getByRole('button', { name: `Excluir o perfil ${roleName}` }).click()
  await expect(status(page)).toHaveText('Perfil excluído.')
  await expect(page.getByRole('list', { name: 'Perfis de acesso' }).getByText(roleName)).toHaveCount(0)

  // Tudo restaurado: o membro voltou ao perfil das fixtures.
  await switchTo(page, context, accounts.member.email)
  await page.goto(`${base}/painel`)
  expect(await sectionLabels(page)).toEqual(['Dashboard', 'Mensagens', 'Solicitações', 'Criar Evento', 'Membros'])
})

test('sem permissão: 403 nas páginas do proprietário; remover membro; o proprietário nunca é removido nem rebaixado', async ({ page, context }) => {
  // A candidata entra como Membro comum (sem permissões), pelo caminho normal: pedido e aprovação.
  const request = await rpcAs<string>(accounts.applicant.email, 'request_collective_membership', { target: C, profile: null, message: '' })
  await rpcAs(accounts.active.email, 'decide_collective_request', { target_request: request, approve: true })

  await login(page, accounts.applicant.email)
  for (const [path, message] of [
    ['membros', 'Você não tem permissão para gerir os membros neste coletivo.'],
    ['editar', 'Você não tem permissão para editar os dados neste coletivo.'],
    ['perfil', 'Você não tem permissão para editar o perfil público neste coletivo.'],
  ]) {
    const response = await page.goto(`${base}/${path}`)
    expect(response?.status(), path).toBe(403)
    await expect(page.getByText(message)).toBeVisible()
    await expect(page.getByRole('heading', { level: 1, name: collectiveName })).toBeVisible()
  }

  // O membro com "remover membros" abre a lista, mas não atribui perfis nem edita o coletivo.
  await switchTo(page, context, accounts.member.email)
  const membersPage = await page.goto(`${base}/membros`)
  expect(membersPage?.status()).toBe(200)
  await expect(page.getByRole('list', { name: 'Membros' }).getByRole('listitem')).toHaveCount(3)
  await expect(page.getByRole('combobox')).toHaveCount(0)
  await expect(page.getByText(/exclusivo do proprietário/)).toBeVisible()
  expect((await page.goto(`${base}/editar`))?.status()).toBe(403)

  // O banco recusa tocar no proprietário, venha a chamada de onde vier.
  await expect(rpcAs(accounts.member.email, 'remove_collective_member', { target: C, member: OWNER_ID })).rejects.toThrow(/Transfira a propriedade/)
  await expect(rpcAs(accounts.active.email, 'assign_collective_role', { target: C, member: OWNER_ID, target_role: OPS_ROLE })).rejects.toThrow(/Proprietário não recebe outro perfil/)

  // O proprietário vê a lista (ele primeiro, sem controles) e remove a candidata.
  await switchTo(page, context, accounts.active.email)
  await open(page, `${base}/membros`)
  const rows = page.getByRole('list', { name: 'Membros' }).getByRole('listitem')
  await expect(rows).toHaveCount(3)
  await expect(rows.first()).toContainText(accounts.active.name)
  await expect(rows.first()).toContainText('proprietário')
  await expect(rows.first().getByRole('button')).toHaveCount(0)
  await expect(rows.first().getByRole('combobox')).toHaveCount(0)
  const row = rows.filter({ hasText: accounts.applicant.name })
  await expect(row.getByRole('combobox')).toHaveValue(/.+/)
  await row.locator('summary').click()
  await page.getByRole('button', { name: `Confirmar a remoção de ${accounts.applicant.name}` }).click()
  await expect(status(page)).toHaveText('Membro removido do coletivo.')
  await expect(rows).toHaveCount(2)
  await expect(rows.filter({ hasText: accounts.applicant.name })).toHaveCount(0)

  // Removida, a candidata não vê mais o coletivo (404, igual a um que não existe).
  await switchTo(page, context, accounts.applicant.email)
  expect((await page.goto(`${base}/painel`))?.status()).toBe(404)
})
