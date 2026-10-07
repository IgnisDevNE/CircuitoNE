import { createClient } from '@supabase/supabase-js'
import { expect, test, type Browser, type Locator, type Page } from '@playwright/test'
import { rpcAs } from './rpc'
import { padded, PDF, pdf, PNG_BLUE, PNG_GREEN, PNG_RED, png } from './files'
import { accounts, fixturePassword, login } from './session'

// Uploads (W11) contra o Supabase local com Storage: foto principal e galeria do artista, PDFs privados (presskit e lista
// de serviços), imagem do coletivo e capa de evento. Escreve dados e objetos: roda no projeto `uploads`, depois dos demais
// specs e uma tela por vez; cada teste desfaz o que enviou (removendo pelo próprio app e, no fim, por varredura do Storage
// com a sessão da conta sintética, sem nenhuma chave de serviço).
const activeArtist = '02000000-0000-4000-8000-000000000001'
const activeServices = '02000000-0000-4000-8000-000000000003'
const activeAudiovisual = '02000000-0000-4000-8000-000000000004'
const collectiveId = '05000000-0000-4000-8000-000000000001'
const artistName = 'Artista sintético público'
const email = accounts.active.email
const stamp = Date.now().toString(36)

const supabaseUrl = () => process.env.SUPABASE_URL!

let errors: string[]
test.beforeEach(({ page }) => {
  errors = []
  page.on('pageerror', (error) => errors.push(error.message))
})
test.afterEach(() => {
  expect(errors).toEqual([])
})

test.describe.configure({ mode: 'serial' })
test.beforeEach(({}, testInfo) => {
  test.skip(testInfo.project.name !== 'uploads', 'os testes que mudam dados e objetos rodam uma vez só')
})

/** Cliente com a sessão da conta sintética (chave publicável, RLS): o mesmo caminho que o app usa. */
async function signedIn(account: string = email) {
  const client = createClient(supabaseUrl(), process.env.SUPABASE_PUBLISHABLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } })
  const { error } = await client.auth.signInWithPassword({ email: account, password: fixturePassword })
  if (error) throw new Error(error.message)
  return client
}

/** Remove tudo o que sobrou nas pastas das entidades usadas aqui (limpeza de melhor esforço, sempre com a política do dono). */
async function sweepStorage(folders: { bucket: 'public-images' | 'private-documents'; id: string }[]) {
  const client = await signedIn()
  for (const { bucket, id } of folders) {
    const { data } = await client.storage.from(bucket).list(id)
    if (data?.length) await client.storage.from(bucket).remove(data.map((object) => `${id}/${object.name}`))
  }
}

async function objectCount(bucket: 'public-images' | 'private-documents', id: string) {
  const client = await signedIn()
  const { data, error } = await client.storage.from(bucket).list(id)
  if (error) throw new Error(error.message)
  return data.length
}

test.afterAll(async () => {
  try {
    const profile = await rpcAs<{ images: { id: string }[] }>(email, 'get_my_profile', { target: activeArtist })
    for (const image of profile.images) await rpcAs(email, 'detach_profile_image', { target: activeArtist, image: image.id })
    await rpcAs(email, 'set_professional_document', { target: activeArtist, kind: 'presskit', object_path: null })
    await rpcAs(email, 'set_professional_document', { target: activeServices, kind: 'services', object_path: null })
    await rpcAs(email, 'set_collective_image', { target: collectiveId, object_path: null })
    await sweepStorage([
      { bucket: 'public-images', id: activeArtist },
      { bucket: 'public-images', id: collectiveId },
      { bucket: 'private-documents', id: activeArtist },
      { bucket: 'private-documents', id: activeServices },
    ])
  } catch {
    // Limpeza de melhor esforço: os objetos ficam sob ids de entidades sintéticas do Supabase local descartável.
  }
})

const hydrated = (page: Page) =>
  expect.poll(() => page.locator('main form').first().evaluate((form) => Object.keys(form).some((key) => key.startsWith('__reactFiber')))).toBe(true)

const open = async (page: Page, path: string) => {
  const response = await page.goto(path)
  await hydrated(page)
  return response
}

/** Contexto de um visitante anônimo (sem cookies). */
async function anonymous(browser: Browser, baseURL: string | undefined) {
  const context = await browser.newContext({ baseURL })
  return { context, page: await context.newPage() }
}

/**
 * GET como a conta da página. O cookie de sessão do app é Secure e o servidor local é http: o navegador o envia (127.0.0.1 conta
 * como seguro), mas a API de requisições do Playwright não, então o cabeçalho é montado a partir dos cookies do contexto.
 */
async function getAs(page: Page, path: string, options: { maxRedirects?: number } = {}) {
  const cookie = (await page.context().cookies()).map((item) => `${item.name}=${item.value}`).join('; ')
  return page.request.get(path, { headers: { cookie }, ...options })
}

const loaded = (image: Locator) => expect.poll(() => image.evaluate((element: HTMLImageElement) => element.complete && element.naturalWidth)).toBeGreaterThan(0)
const panel = (page: Page, title: string) => page.locator('section', { has: page.getByRole('heading', { level: 2, name: title, exact: true }) })
const subsection = (page: Page, title: string | RegExp) => page.getByRole('region', { name: title, exact: typeof title === 'string' })
const profilePath = (id: string) => `/painel/perfil/${id}`

test('foto principal: envia, aparece na página pública do artista, substitui e apaga o objeto antigo', async ({ page, browser, baseURL, request }) => {
  await login(page, email)
  await open(page, profilePath(activeArtist))
  const photos = panel(page, 'fotos')
  const main = subsection(page, 'foto principal')
  await expect(photos.getByText('galeria (0/10)')).toBeVisible()

  // Antes de qualquer envio o perfil usa a foto neutra.
  const visitor = await anonymous(browser, baseURL)
  try {
    await visitor.page.goto(`/artistas/${activeArtist}`)
    await expect(visitor.page.getByRole('img', { name: `Foto de apresentação de ${artistName}` })).toHaveAttribute('src', '/artist-photo-fallback.svg')

    await main.getByLabel(/Enviar foto principal/).setInputFiles(png(PNG_RED))
    await main.getByRole('button', { name: 'enviar foto', exact: true }).click()
    await expect(main.getByRole('status')).toHaveText('Foto principal atualizada.')
    const editorImage = main.getByRole('img', { name: `Foto principal de ${artistName}` })
    const firstSrc = (await editorImage.getAttribute('src'))!
    expect(firstSrc.startsWith(`${supabaseUrl()}/storage/v1/object/public/public-images/${activeArtist}/`)).toBe(true)
    expect(firstSrc).toMatch(/\.png$/)
    await loaded(editorImage)

    // Página pública (visitante anônimo): a foto vem do Storage público e carrega.
    await visitor.page.goto(`/artistas/${activeArtist}`)
    const publicImage = visitor.page.getByRole('img', { name: `Foto de apresentação de ${artistName}` })
    await expect(publicImage).toHaveAttribute('src', firstSrc)
    await loaded(publicImage)
    await visitor.page.goto('/artistas')
    await expect(visitor.page.getByRole('img', { name: `Foto de ${artistName}` })).toHaveAttribute('src', firstSrc)
    expect((await request.get(firstSrc)).status()).toBe(200)

    // Substituir: o novo arquivo vale e o antigo some do Storage (e do endereço público).
    await main.getByLabel(/Trocar a foto principal/).setInputFiles(png(PNG_BLUE, 'outra.png'))
    await main.getByRole('button', { name: 'trocar foto', exact: true }).click()
    await expect(main.getByRole('status')).toHaveText('Foto principal atualizada.')
    await expect(editorImage).not.toHaveAttribute('src', firstSrc)
    const secondSrc = (await editorImage.getAttribute('src'))!
    expect(secondSrc).not.toBe(firstSrc)
    await visitor.page.goto(`/artistas/${activeArtist}`)
    await expect(visitor.page.getByRole('img', { name: `Foto de apresentação de ${artistName}` })).toHaveAttribute('src', secondSrc)
    expect((await request.get(firstSrc)).status()).not.toBe(200)
    expect((await request.get(secondSrc)).status()).toBe(200)
    expect(await objectCount('public-images', activeArtist)).toBe(1)

    // Remover: volta a foto neutra e o objeto é apagado.
    await main.getByRole('button', { name: 'Remover a foto principal', exact: true }).click()
    await expect(main.getByRole('status')).toHaveText('Foto principal removida.')
    await expect(main.getByRole('img')).toHaveCount(0)
    await visitor.page.goto(`/artistas/${activeArtist}`)
    await expect(visitor.page.getByRole('img', { name: `Foto de apresentação de ${artistName}` })).toHaveAttribute('src', '/artist-photo-fallback.svg')
    expect((await request.get(secondSrc)).status()).not.toBe(200)
    expect(await objectCount('public-images', activeArtist)).toBe(0)
  } finally {
    await visitor.context.close()
  }
})

test('galeria: adiciona em ordem, reordena, remove, respeita o limite e aparece na página pública', async ({ page, browser, baseURL }) => {
  await login(page, email)
  await open(page, profilePath(activeArtist))
  const add = async (buffer: Buffer, name: string) => {
    await subsection(page, /galeria \(\d+\/10\)/).getByLabel(/Adicionar imagem à galeria/).setInputFiles(png(buffer, name))
    await subsection(page, /galeria \(\d+\/10\)/).getByRole('button', { name: 'adicionar à galeria', exact: true }).click()
  }
  const order = async () => {
    const sources = await page.getByRole('img', { name: /da galeria de/ }).evaluateAll((images) => images.map((image) => (image as HTMLImageElement).src))
    return sources.map((src) => src.split('/').pop()!)
  }

  await add(PNG_RED, 'a.png')
  await expect(subsection(page, 'galeria (1/10)').getByRole('status')).toHaveText('Imagem adicionada à galeria.')
  await add(PNG_BLUE, 'b.png')
  await expect(subsection(page, 'galeria (2/10)')).toBeVisible()
  await add(PNG_GREEN, 'c.png')
  await expect(subsection(page, 'galeria (3/10)')).toBeVisible()
  const [first, second, third] = await order()
  expect(new Set([first, second, third]).size).toBe(3)

  // A primeira não sobe e a última não desce (botões desativados); mover a terceira para antes troca com a segunda.
  await expect(page.getByRole('button', { name: 'Mover para antes: imagem 1', exact: true })).toBeDisabled()
  await expect(page.getByRole('button', { name: 'Mover para depois: imagem 3', exact: true })).toBeDisabled()
  await page.getByRole('button', { name: 'Mover para antes: imagem 3', exact: true }).click()
  await expect(subsection(page, 'galeria (3/10)').getByRole('status')).toHaveText('Ordem da galeria atualizada.')
  await expect.poll(order).toEqual([first, third, second])

  // Página pública: a galeria mostra as três na mesma ordem.
  const visitor = await anonymous(browser, baseURL)
  try {
    await visitor.page.goto(`/artistas/${activeArtist}`)
    const publicGallery = visitor.page.getByRole('img', { name: new RegExp(`${artistName} — imagem \\d`) })
    await expect(publicGallery).toHaveCount(3)
    const publicSources = await publicGallery.evaluateAll((images) => images.map((image) => (image as HTMLImageElement).src.split('/').pop()!))
    expect(publicSources).toEqual([first, third, second])
    await publicGallery.first().scrollIntoViewIfNeeded()
    await loaded(publicGallery.first())

    // Remover a do meio: a galeria fecha o espaço e o objeto é apagado.
    await page.getByRole('button', { name: 'Remover a imagem 2 da galeria', exact: true }).click()
    await expect(subsection(page, 'galeria (2/10)').getByRole('status')).toHaveText('Imagem removida da galeria.')
    await expect.poll(order).toEqual([first, second])
    expect(await objectCount('public-images', activeArtist)).toBe(2)
    await visitor.page.reload()
    await expect(visitor.page.getByRole('img', { name: new RegExp(`${artistName} — imagem \\d`) })).toHaveCount(2)
  } finally {
    await visitor.context.close()
  }

  // Limite: 10 imagens; a 11ª é recusada pelo banco antes de ficar no Storage.
  for (let index = 3; index <= 10; index += 1) {
    await add(PNG_GREEN, `g${index}.png`)
    await expect(subsection(page, `galeria (${index}/10)`)).toBeVisible()
  }
  await expect(page.getByText(/A galeria está cheia/)).toBeVisible()
  await expect(page.getByLabel(/Adicionar imagem à galeria/)).toHaveCount(0)
  expect(await objectCount('public-images', activeArtist)).toBe(10)

  // Limpeza pelo próprio app.
  for (let index = 10; index >= 1; index -= 1) {
    await page.getByRole('button', { name: `Remover a imagem ${index} da galeria`, exact: true }).click()
    await expect(subsection(page, `galeria (${index - 1}/10)`)).toBeVisible()
  }
  expect(await objectCount('public-images', activeArtist)).toBe(0)
})

test('arquivos inválidos: formato, conteúdo falso e tamanho são recusados no servidor, sem deixar nada no Storage', async ({ page }) => {
  await login(page, email)
  await open(page, profilePath(activeArtist))
  const main = subsection(page, 'foto principal')
  const input = main.getByLabel(/Enviar foto principal/)
  // O navegador também confere (e bloqueia o envio); para exercitar o servidor, a validação nativa é desligada e a resposta da ação é conferida.
  const send = async (file: { name: string; mimeType: string; buffer: Buffer }) => {
    await page.evaluate(() => document.querySelectorAll('form').forEach((form) => form.setAttribute('novalidate', '')))
    await input.setInputFiles(file)
    const response = page.waitForResponse((candidate) => candidate.request().method() === 'POST' && candidate.url().includes('/painel/perfil/'))
    await main.getByRole('button', { name: 'enviar foto', exact: true }).click()
    return (await response).status()
  }

  // Conteúdo que não é PNG com tipo e extensão de PNG.
  expect(await send({ name: 'falso.png', mimeType: 'image/png', buffer: Buffer.from('isto não é uma imagem') })).toBe(422)
  await expect(main.getByText(/O conteúdo do arquivo não corresponde ao formato/).first()).toBeVisible()
  // Tipo fora da lista (GIF) e PDF no campo de imagem.
  expect(await send({ name: 'animada.gif', mimeType: 'image/gif', buffer: Buffer.from('GIF89a') })).toBe(422)
  await expect(main.getByText(/Formato não aceito/).first()).toBeVisible()
  // Acima de 5.000.000 bytes: um byte a mais é recusado (com a assinatura de PNG, para chegar até a conferência de tamanho).
  expect(await send({ name: 'grande.png', mimeType: 'image/png', buffer: padded(PNG_RED, 5_000_001) })).toBe(422)
  await expect(main.getByText(/A imagem passa de 5 MB/).first()).toBeVisible()
  await expect(main.getByRole('img')).toHaveCount(0)
  expect(await objectCount('public-images', activeArtist)).toBe(0)

  // No limite exato (5.000.000 bytes) o arquivo vale.
  expect(await send({ name: 'limite.png', mimeType: 'image/png', buffer: padded(PNG_RED, 5_000_000) })).toBe(200)
  await expect(main.getByRole('status')).toHaveText('Foto principal atualizada.')
  await main.getByRole('button', { name: 'Remover a foto principal', exact: true }).click()
  await expect(main.getByRole('status')).toHaveText('Foto principal removida.')
  expect(await objectCount('public-images', activeArtist)).toBe(0)
})

test('presskit em PDF: privado (nunca público), aberto só pelo titular com endereço assinado, e remoção apaga o arquivo', async ({ page, browser, baseURL, request }) => {
  await login(page, email)
  await open(page, profilePath(activeArtist))
  const documents = panel(page, 'presskit em PDF')
  await documents.getByLabel(/Enviar PDF/).setInputFiles(pdf('meu-presskit.pdf'))
  await documents.getByRole('button', { name: 'enviar PDF', exact: true }).click()
  await expect(documents.getByRole('status')).toContainText('Presskit em PDF enviado')
  const link = documents.getByRole('link', { name: /abrir o PDF enviado/ })
  await expect(link).toHaveAttribute('href', `/painel/documentos/${activeArtist}/presskit`)

  const profile = await rpcAs<{ professional: { presskit_path: string; presskit_bytes: number } }>(email, 'get_my_profile', { target: activeArtist })
  const path = profile.professional.presskit_path
  expect(path).toMatch(new RegExp(`^${activeArtist}/[0-9a-f-]{36}\\.pdf$`))
  expect(profile.professional.presskit_bytes).toBe(PDF.length)

  // O titular abre o PDF pelo app (redireciona ao endereço assinado) e o conteúdo é o enviado.
  const opened = await getAs(page, `/painel/documentos/${activeArtist}/presskit`)
  expect(opened.status()).toBe(200)
  expect(opened.headers()['content-type']).toContain('application/pdf')
  expect((await opened.body()).subarray(0, 5).toString()).toBe('%PDF-')
  const redirect = await getAs(page, `/painel/documentos/${activeArtist}/presskit`, { maxRedirects: 0 })
  expect(redirect.status()).toBe(302)
  expect(redirect.headers()['cache-control']).toContain('no-store')
  expect(redirect.headers().location).toContain('/storage/v1/object/sign/private-documents/')

  // Link e PDF do presskit são excludentes: com PDF, um link é recusado no campo.
  await page.getByLabel(/Presskit \(URL\)/).fill('https://example.invalid/presskit')
  await page.getByRole('button', { name: 'salvar dados profissionais', exact: true }).click()
  await expect(page.getByText('[erro] Remova o PDF do presskit antes de informar um link.')).toBeVisible()

  // Nunca público: nem pelo endereço do bucket público, nem pelo autenticado sem sessão, nem na página pública do artista.
  expect((await request.get(`${supabaseUrl()}/storage/v1/object/public/private-documents/${path}`)).status()).not.toBe(200)
  expect(
    (await request.get(`${supabaseUrl()}/storage/v1/object/authenticated/private-documents/${path}`, { headers: { apikey: process.env.SUPABASE_PUBLISHABLE_KEY! } })).status(),
  ).not.toBe(200)
  const visitor = await anonymous(browser, baseURL)
  try {
    const anonymousOpen = await visitor.page.request.get(`/painel/documentos/${activeArtist}/presskit`, { maxRedirects: 0 })
    expect(anonymousOpen.status()).toBe(303)
    expect(anonymousOpen.headers().location).toBe('/entrar')
    const publicPage = await visitor.page.goto(`/artistas/${activeArtist}`)
    const html = await publicPage!.text()
    expect(html).not.toContain(path)
    expect(html).not.toContain('private-documents')
    expect(html).not.toContain('presskit')
  } finally {
    await visitor.context.close()
  }

  // Outra conta ativa (não é a titular nem leitora profissional): 404, sem endereço assinado.
  const other = await anonymous(browser, baseURL)
  try {
    await login(other.page, accounts.member.email)
    const denied = await getAs(other.page, `/painel/documentos/${activeArtist}/presskit`, { maxRedirects: 0 })
    expect(denied.status()).toBe(404)
  } finally {
    await other.context.close()
  }

  // PDF falso (conteúdo de imagem) é recusado; substituir apaga o anterior; remover apaga o arquivo.
  await open(page, profilePath(activeArtist))
  await documents.getByLabel(/Substituir o PDF/).setInputFiles({ name: 'falso.pdf', mimeType: 'application/pdf', buffer: PNG_RED })
  await documents.getByRole('button', { name: 'substituir PDF', exact: true }).click()
  await expect(documents.getByText(/O conteúdo do arquivo não corresponde ao formato/).first()).toBeVisible()
  expect(await objectCount('private-documents', activeArtist)).toBe(1)
  await documents.getByLabel(/Substituir o PDF/).setInputFiles(pdf('novo.pdf'))
  await documents.getByRole('button', { name: 'substituir PDF', exact: true }).click()
  await expect(documents.getByRole('status')).toContainText('Presskit em PDF enviado')
  expect(await objectCount('private-documents', activeArtist)).toBe(1)
  await documents.getByRole('button', { name: 'remover PDF', exact: true }).click()
  await expect(documents.getByRole('status')).toHaveText('Documento removido.')
  await expect(documents.getByRole('link', { name: /abrir o PDF enviado/ })).toHaveCount(0)
  expect(await objectCount('private-documents', activeArtist)).toBe(0)
  const after = await getAs(page, `/painel/documentos/${activeArtist}/presskit`, { maxRedirects: 0 })
  expect(after.status()).toBe(404)
})

test('lista de serviços em PDF (serviços); audiovisual e integrante não têm documento nem fotos', async ({ page }) => {
  await login(page, email)
  await open(page, profilePath(activeServices))
  await expect(page.getByRole('heading', { level: 2, name: 'fotos' })).toHaveCount(0)
  const documents = panel(page, 'lista de serviços e equipamentos (PDF)')
  await documents.getByLabel(/Enviar PDF/).setInputFiles(pdf('lista.pdf'))
  await documents.getByRole('button', { name: 'enviar PDF', exact: true }).click()
  await expect(documents.getByRole('status')).toHaveText('Lista de serviços e equipamentos enviada.')
  await expect(documents.getByRole('link', { name: /abrir o PDF enviado/ })).toHaveAttribute('href', `/painel/documentos/${activeServices}/lista-servicos`)
  const opened = await getAs(page, `/painel/documentos/${activeServices}/lista-servicos`)
  expect(opened.status()).toBe(200)
  expect(opened.headers()['content-type']).toContain('application/pdf')
  // A rota do outro tipo de documento não abre este arquivo.
  expect((await getAs(page, `/painel/documentos/${activeServices}/presskit`, { maxRedirects: 0 })).status()).toBe(404)
  await documents.getByRole('button', { name: 'remover PDF', exact: true }).click()
  await expect(documents.getByRole('status')).toHaveText('Documento removido.')
  expect(await objectCount('private-documents', activeServices)).toBe(0)

  // Audiovisual: portfólio só por link, sem arquivo (RN-12/RN-35); a rota nem abre documento de outro tipo.
  await open(page, profilePath(activeAudiovisual))
  await expect(page.getByRole('heading', { level: 2, name: /PDF|fotos/ })).toHaveCount(0)
  expect((await getAs(page, `/painel/documentos/${activeAudiovisual}/presskit`, { maxRedirects: 0 })).status()).toBe(404)
  // O banco recusa o envio forjado de um documento para audiovisual, mesmo com uma sessão válida.
  await expect(rpcAs(email, 'set_professional_document', { target: activeAudiovisual, kind: 'presskit', object_path: `${activeAudiovisual}/x.pdf` })).rejects.toThrow()
})

test('imagem do coletivo: envia, aparece na página e na lista públicas, substitui e remove (volta à imagem neutra)', async ({ page, browser, baseURL, request }) => {
  await login(page, email)
  await open(page, `/coletivo/${collectiveId}/perfil`)
  const area = panel(page, 'imagem do coletivo')
  await area.getByLabel(/Enviar imagem/).setInputFiles(png(PNG_RED, 'capa.png'))
  await area.getByRole('button', { name: 'enviar imagem', exact: true }).click()
  await expect(page.getByRole('status')).toHaveText('Imagem do coletivo atualizada.')
  const current = area.getByRole('img', { name: /Imagem atual de Organização sintética 1/ })
  const firstSrc = (await current.getAttribute('src'))!
  expect(firstSrc.startsWith(`${supabaseUrl()}/storage/v1/object/public/public-images/${collectiveId}/`)).toBe(true)
  await loaded(current)
  // A versão do cadastro não muda com a imagem (independente da edição de texto).
  await expect(page.getByText(/versão \d+/)).toBeVisible()

  const visitor = await anonymous(browser, baseURL)
  try {
    await visitor.page.goto(`/coletivos/${collectiveId}`)
    await expect(visitor.page.getByRole('img', { name: /Capa do coletivo Organização sintética 1/ })).toHaveAttribute('src', firstSrc)
    await visitor.page.goto('/coletivos')
    await expect(visitor.page.getByRole('img', { name: /Imagem do coletivo Organização sintética 1/ })).toHaveAttribute('src', firstSrc)

    await area.getByLabel(/Substituir a imagem/).setInputFiles(png(PNG_BLUE, 'nova.png'))
    await area.getByRole('button', { name: 'substituir imagem', exact: true }).click()
    await expect(page.getByRole('status')).toHaveText('Imagem do coletivo atualizada.')
    await expect(current).not.toHaveAttribute('src', firstSrc)
    const secondSrc = (await current.getAttribute('src'))!
    expect(secondSrc).not.toBe(firstSrc)
    expect((await request.get(firstSrc)).status()).not.toBe(200)
    expect((await request.get(secondSrc)).status()).toBe(200)
    expect(await objectCount('public-images', collectiveId)).toBe(1)

    await area.getByRole('button', { name: 'remover imagem', exact: true }).click()
    await expect(page.getByRole('status')).toContainText('Imagem removida')
    await expect(current).toHaveCount(0)
    await visitor.page.goto(`/coletivos/${collectiveId}`)
    await expect(visitor.page.getByRole('img', { name: /Capa do coletivo Organização sintética 1/ })).toHaveAttribute('src', '/collective-cover-fallback.svg')
    expect((await request.get(secondSrc)).status()).not.toBe(200)
    expect(await objectCount('public-images', collectiveId)).toBe(0)
  } finally {
    await visitor.context.close()
  }
})

test('imagem do coletivo: quem não é o proprietário não envia nem remove (o banco recusa)', async ({ page }) => {
  // fixture-member é membro do coletivo 1, mas não o proprietário: a página fica bloqueada e o banco recusa a RPC.
  await login(page, accounts.member.email)
  const response = await page.goto(`/coletivo/${collectiveId}/perfil`)
  expect([403, 404]).toContain(response!.status())
  await expect(rpcAs(accounts.member.email, 'set_collective_image', { target: collectiveId, object_path: null })).rejects.toThrow()
  const client = await signedIn(accounts.member.email)
  const upload = await client.storage.from('public-images').upload(`${collectiveId}/invasor.png`, PNG_RED, { contentType: 'image/png' })
  expect(upload.error).not.toBeNull()
})

test('capa do evento: envia no formulário de gestão, aparece na agenda e na página pública, troca por link e remove', async ({ page, browser, baseURL, request }) => {
  const created = await rpcAs<string>(email, 'create_event', {
    collective: collectiveId,
    payload: { name: `Festa W11 ${stamp}`, kind: 'festa', starts_at: '2031-06-20T20:00:00-03:00', city: 'Recife', state_code: 'PE', venue: 'Pátio sintético', is_free: true },
    request_id: crypto.randomUUID(),
  })
  const eventId = created
  try {
    await rpcAs(email, 'publish_event', { target: eventId, expected_version: 1 })
    await login(page, email)
    await open(page, `/coletivo/${collectiveId}/eventos/${eventId}`)
    await expect(page.getByText(/Nenhuma capa enviada/)).toBeVisible()
    await page.getByLabel(/Enviar capa \(arquivo\)/).setInputFiles(png(PNG_RED, 'capa-evento.png'))
    await page.getByRole('button', { name: 'salvar alterações', exact: true }).click()
    await expect(page.getByRole('status')).toHaveText('Alterações salvas.')
    const preview = page.getByRole('img', { name: /Capa enviada do evento/ })
    const firstSrc = (await preview.getAttribute('src'))!
    expect(firstSrc.startsWith(`${supabaseUrl()}/storage/v1/object/public/public-images/${eventId}/`)).toBe(true)
    await loaded(preview)
    const row = await rpcAs<{ cover_path: string; cover_bytes: number; cover_url: string | null }>(email, 'get_event', { target: eventId })
    expect(row.cover_bytes).toBe(PNG_RED.length)
    expect(row.cover_url).toBeNull()

    const visitor = await anonymous(browser, baseURL)
    try {
      await visitor.page.goto(`/eventos/${eventId}`)
      await expect(visitor.page.getByRole('img', { name: /Capa do evento Festa W11/ })).toHaveAttribute('src', firstSrc)
      await visitor.page.goto('/eventos')
      await expect(visitor.page.getByRole('img', { name: `Capa do evento Festa W11 ${stamp}` })).toHaveAttribute('src', firstSrc)

      // Link novo com capa enviada: a capa enviada sai (o banco não aceita as duas) e o link vale.
      await page.getByRole('textbox', { name: /Imagem de capa \(link\)/ }).fill('https://example.invalid/capa-externa.png')
      await page.getByRole('button', { name: 'salvar alterações', exact: true }).click()
      await expect(page.getByRole('status')).toHaveText('Alterações salvas.')
      await expect(page.getByText(/Nenhuma capa enviada/)).toBeVisible()
      expect((await request.get(firstSrc)).status()).not.toBe(200)
      await visitor.page.goto(`/eventos/${eventId}`)
      await expect(visitor.page.getByRole('img', { name: /Capa do evento Festa W11/ })).toHaveAttribute('src', 'https://example.invalid/capa-externa.png')

      // Enviar de novo (limpa o link), conferir que a enviada vale mais, e remover volta à capa neutra.
      await page.getByLabel(/Enviar capa \(arquivo\)/).setInputFiles(png(PNG_GREEN, 'outra-capa.png'))
      await page.getByRole('button', { name: 'salvar alterações', exact: true }).click()
      await expect(page.getByRole('status')).toHaveText('Alterações salvas.')
      await expect(page.getByRole('textbox', { name: /Imagem de capa \(link\)/ })).toHaveValue('')
      const secondSrc = (await preview.getAttribute('src'))!
      await page.getByRole('checkbox', { name: 'Remover a capa enviada' }).check()
      await page.getByRole('textbox', { name: /Imagem de capa \(link\)/ }).fill('')
      await page.getByRole('button', { name: 'salvar alterações', exact: true }).click()
      await expect(page.getByRole('status')).toHaveText('Alterações salvas.')
      await expect(page.getByText(/Nenhuma capa enviada/)).toBeVisible()
      expect((await request.get(secondSrc)).status()).not.toBe(200)
      await visitor.page.goto(`/eventos/${eventId}`)
      await expect(visitor.page.getByRole('img', { name: /Capa do evento Festa W11/ })).toHaveAttribute('src', '/event-cover-fallback.svg')
      expect(await objectCount('public-images', eventId)).toBe(0)

      // Arquivo inválido: o erro aparece no campo da capa e nada é salvo.
      await page.getByLabel(/Enviar capa \(arquivo\)/).setInputFiles({ name: 'falsa.png', mimeType: 'image/png', buffer: Buffer.from('não é imagem') })
      await page.evaluate(() => (document.querySelector('input[name="cover_file"]') as HTMLInputElement).setCustomValidity(''))
      await page.getByRole('button', { name: 'salvar alterações', exact: true }).click()
      await expect(page.getByText('[erro] O conteúdo do arquivo não corresponde ao formato. Envie o arquivo original, sem renomear a extensão.')).toBeVisible()
      expect(await objectCount('public-images', eventId)).toBe(0)
    } finally {
      await visitor.context.close()
    }
  } finally {
    // Nada fica publicado nem com arquivos: remove objetos e cancela o evento.
    try {
      await sweepStorage([{ bucket: 'public-images', id: eventId }])
      const row = await rpcAs<{ state: string; version: number }>(email, 'get_event', { target: eventId })
      if (row.state !== 'cancelled') await rpcAs(email, 'cancel_event', { target: eventId, expected_version: row.version })
    } catch {
      // Limpeza de melhor esforço: o evento tem data distante e nome próprio.
    }
  }
})
