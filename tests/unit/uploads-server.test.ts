// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { boundedBody, boundedMultipart, loginAction } from '../../src/server/auth.server'
import { openDocument, SIGNED_URL_SECONDS } from '../../src/server/documents.server'
import { publicImageUrl } from '../../src/server/public-image'
import { readUpload, removeStored, returnedPath, storageFailure, storeUpload } from '../../src/server/storage.server'
import { collectiveProfileAction } from '../../src/server/collective-manage.server'
import { eventManageAction } from '../../src/server/events-manage.server'
import { profileAction } from '../../src/server/account-settings.server'
import type { SupabaseServerClient } from '../../src/server/supabase.server'

const origin = 'https://circuitone-dev.magalz.space'
const SUPABASE = 'https://odphoxozclrshqjgwbqk.supabase.co'
const C = '05000000-0000-4000-8000-000000000001'
const E = '0a000000-0000-4000-8000-000000000005'
const P = '02000000-0000-4000-8000-000000000001'
const OLD = (id: string, name: string, ext = 'png') => `${id}/${name}.${ext}`

const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4])
const PDF = Uint8Array.from([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37, 10, 11])
const upload = (bytes: Uint8Array<ArrayBuffer>, name = 'arquivo.png', type = 'image/png') => new File([bytes], name, { type })

// ---- Requisições multipart ----

const multipart = (path: string, fields: Record<string, string | string[] | File>, headers: Record<string, string> = {}) => {
  const body = new FormData()
  for (const [key, value] of Object.entries(fields))
    if (value instanceof File) body.append(key, value)
    else for (const v of Array.isArray(value) ? value : [value]) body.append(key, v)
  return new Request(origin + path, { method: 'POST', headers: { Origin: origin, ...headers }, body })
}

describe('boundedMultipart / boundedBody', () => {
  it('campos de texto viram URLSearchParams (repetidos incluídos) e arquivos, um mapa; partes vazias de arquivo são ignoradas', async () => {
    const request = multipart('/x', { intent: 'upload', estilo: ['a', 'b'], arquivo: upload(PNG), vazio: new File([], '', { type: 'application/octet-stream' }) })
    const { form, files } = await boundedMultipart(request, 1_000_000)
    expect(form.get('intent')).toBe('upload')
    expect(form.getAll('estilo')).toEqual(['a', 'b'])
    expect([...files.keys()]).toEqual(['arquivo'])
    expect(files.get('arquivo')!.size).toBe(PNG.length)
    expect(files.get('arquivo')!.type).toBe('image/png')
  })

  it('acima do limite: 413 (o corpo é lido e descartado, não guardado); muito acima, 413 pelo Content-Length', async () => {
    const big = upload(new Uint8Array(2000))
    await expect(boundedMultipart(multipart('/x', { arquivo: big }), 1000)).rejects.toMatchObject({ status: 413 })
    await expect(boundedMultipart(multipart('/x', { arquivo: big }, { 'Content-Length': '99999999' }), 1000)).rejects.toMatchObject({ status: 413 })
  })

  it('multipart malformado: 415', async () => {
    const request = new Request(origin + '/x', { method: 'POST', headers: { 'Content-Type': 'multipart/form-data; boundary=zzz' }, body: 'isto não é multipart' })
    await expect(boundedMultipart(request, 1000)).rejects.toMatchObject({ status: 415 })
  })

  it('boundedBody: multipart só onde há limite de upload; urlencoded segue o limite de texto', async () => {
    await expect(boundedBody(multipart('/x', { arquivo: upload(PNG) }), { limit: 1000 })).rejects.toMatchObject({ status: 415 })
    const viaMultipart = await boundedBody(multipart('/x', { intent: 'a', arquivo: upload(PNG) }), { limit: 1000, uploadLimit: 1_000_000 })
    expect(viaMultipart.form.get('intent')).toBe('a')
    expect(viaMultipart.files.has('arquivo')).toBe(true)
    const text = new Request(origin + '/x', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'intent=b' })
    const viaText = await boundedBody(text, { limit: 1000, uploadLimit: 1_000_000 })
    expect(viaText.form.get('intent')).toBe('b')
    expect(viaText.files.size).toBe(0)
    const tooBig = new Request(origin + '/x', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'x'.repeat(2000) })
    await expect(boundedBody(tooBig, { limit: 1000, uploadLimit: 1_000_000 })).rejects.toMatchObject({ status: 413 })
  })
})

// ---- Funções do Storage ----

describe('publicImageUrl', () => {
  beforeEach(() => vi.stubEnv('SUPABASE_URL', SUPABASE + '/'))
  afterEach(() => vi.unstubAllEnvs())

  it('monta a URL pública do bucket público, sem barra duplicada', () => {
    expect(publicImageUrl(OLD(P, 'foto'))).toBe(`${SUPABASE}/storage/v1/object/public/public-images/${P}/foto.png`)
    expect(publicImageUrl(OLD(P, 'foto', 'webp'))).toMatch(/foto\.webp$/)
  })

  it('sem caminho, sem Supabase ou com caminho fora do formato das constraints: nulo', () => {
    expect(publicImageUrl(null)).toBeNull()
    expect(publicImageUrl(undefined)).toBeNull()
    expect(publicImageUrl('')).toBeNull()
    for (const bad of [`${P}/sub/foto.png`, `${P}/foto.gif`, `${P}/foto.pdf`, '../etc/passwd', `${'0A000000-0000-4000-8000-000000000001'}/foto.png`, `${P}/foto.png?x=1`, `${P}/%2e%2e.png`])
      expect(publicImageUrl(bad)).toBeNull()
    vi.stubEnv('SUPABASE_URL', '')
    expect(publicImageUrl(OLD(P, 'foto'))).toBeNull()
  })
})

describe('readUpload', () => {
  it('lê, confere e devolve os bytes com a extensão do conteúdo', async () => {
    const files = new Map([['arquivo', upload(PNG, 'qualquer-nome.jpg')]])
    const result = await readUpload(files, 'arquivo', 'image')
    expect(result).toMatchObject({ ok: true, extension: 'png', contentType: 'image/png', size: PNG.length })
    expect(result.ok && [...result.bytes]).toEqual([...PNG])
  })

  it('campo ausente, tipo errado, tamanho e conteúdo falso viram mensagem', async () => {
    expect(await readUpload(new Map(), 'arquivo', 'image')).toMatchObject({ ok: false, error: 'Escolha um arquivo para enviar.' })
    expect(await readUpload(new Map([['arquivo', upload(PNG, 'a.gif', 'image/gif')]]), 'arquivo', 'image')).toMatchObject({ ok: false, error: expect.stringContaining('Formato não aceito') })
    expect(await readUpload(new Map([['arquivo', upload(new Uint8Array(5_000_001), 'a.png')]]), 'arquivo', 'image')).toMatchObject({ ok: false, error: expect.stringContaining('5 MB') })
    expect(await readUpload(new Map([['arquivo', upload(PDF, 'a.png')]]), 'arquivo', 'image')).toMatchObject({ ok: false, error: expect.stringContaining('conteúdo') })
    expect(await readUpload(new Map([['arquivo', upload(PNG, 'a.pdf', 'application/pdf')]]), 'arquivo', 'document')).toMatchObject({ ok: false, error: expect.stringContaining('conteúdo') })
  })
})

type StorageOptions = { uploadError?: { status?: number; message?: string }; removeError?: unknown; removeThrows?: boolean }
function storageClient(options: StorageOptions = {}) {
  const uploads: { bucket: string; path: string; size: number; options: Record<string, unknown> }[] = []
  const removed: { bucket: string; paths: string[] }[] = []
  const client = {
    storage: {
      from: (bucket: string) => ({
        upload: vi.fn(async (path: string, body: Uint8Array, opts: Record<string, unknown>) => {
          uploads.push({ bucket, path, size: body.byteLength, options: opts })
          return options.uploadError ? { data: null, error: options.uploadError } : { data: { path }, error: null }
        }),
        remove: vi.fn(async (paths: string[]) => {
          if (options.removeThrows) throw new Error('rede')
          removed.push({ bucket, paths })
          return { data: [], error: options.removeError ?? null }
        }),
      }),
    },
  }
  return { client: client as unknown as SupabaseServerClient, uploads, removed }
}

describe('storeUpload / removeStored', () => {
  const prepared = { ok: true as const, bytes: PNG, extension: 'png' as const, contentType: 'image/png', size: PNG.length }

  it('envia para <entidade>/<nome novo>.<ext> no bucket certo, sem sobrescrever', async () => {
    const { client, uploads } = storageClient()
    const first = await storeUpload(client, 'image', P, prepared)
    const second = await storeUpload(client, 'image', P, prepared)
    expect(first).toMatch(new RegExp(`^${P}/[0-9a-f-]{36}\\.png$`))
    expect(second).not.toBe(first)
    expect(uploads[0]).toMatchObject({ bucket: 'public-images', path: first, size: PNG.length, options: { contentType: 'image/png', upsert: false, cacheControl: '31536000' } })
    await storeUpload(client, 'document', P, { ...prepared, bytes: PDF, extension: 'pdf', contentType: 'application/pdf', size: PDF.length })
    expect(uploads[2]).toMatchObject({ bucket: 'private-documents', options: { contentType: 'application/pdf', upsert: false } })
    expect(uploads[2].path).toMatch(/\.pdf$/)
  })

  it('erros do Storage viram mensagens em pt-BR (tamanho, formato, sessão, permissão) ou indisponibilidade', async () => {
    const reason = async (status: number | undefined) => {
      const { client } = storageClient({ uploadError: { status, message: 'detalhe interno do Storage' } })
      return storeUpload(client, 'image', P, prepared).then(
        () => new Error('esperava falha') as Error & { status: number },
        (error: Error & { status: number }) => error,
      )
    }
    expect(await reason(413)).toMatchObject({ status: 422, message: expect.stringContaining('5 MB') })
    expect(await reason(415)).toMatchObject({ status: 422, message: expect.stringContaining('Formato não aceito') })
    expect(await reason(401)).toMatchObject({ status: 401, message: expect.stringContaining('sessão expirou') })
    expect(await reason(403)).toMatchObject({ status: 403, message: expect.stringContaining('permissão') })
    expect(await reason(500)).toMatchObject({ status: 503 })
    expect(await reason(undefined)).toMatchObject({ status: 503 })
    expect((await reason(500)).message).not.toContain('detalhe interno')
    expect(storageFailure({ statusCode: '413' }, 'document')).toMatchObject({ status: 422, message: expect.stringContaining('10 MB') })
  })

  it('removeStored apaga só caminhos de verdade, em uma chamada, e nunca lança', async () => {
    const { client, removed } = storageClient()
    await removeStored(client, 'image', [null, undefined, '', 'a/b.png', 7, 'c/d.png'])
    expect(removed).toEqual([{ bucket: 'public-images', paths: ['a/b.png', 'c/d.png'] }])
    await removeStored(client, 'image', [null])
    expect(removed).toHaveLength(1)
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    await removeStored(storageClient({ removeError: { message: 'x' } }).client, 'document', ['a.pdf'])
    await removeStored(storageClient({ removeThrows: true }).client, 'document', ['a.pdf'])
    expect(error).toHaveBeenCalledTimes(2)
    // O log não leva o caminho nem a mensagem do provedor.
    expect(JSON.stringify(error.mock.calls)).not.toContain('a.pdf')
    error.mockRestore()
  })

  it('returnedPath lê o caminho devolvido pela RPC', () => {
    expect(returnedPath('x/y.png')).toBe('x/y.png')
    expect(returnedPath(null)).toBeNull()
    expect(returnedPath('')).toBeNull()
    expect(returnedPath(5)).toBeNull()
    expect(returnedPath({ replaced_path: 'x/y.png' }, 'replaced_path')).toBe('x/y.png')
    expect(returnedPath({ replaced_path: null }, 'replaced_path')).toBeNull()
    expect(returnedPath(null, 'replaced_path')).toBeNull()
  })
})

// ---- Pontos de entrada com o cliente real e fetch simulado ----

type Call = { method: string; path: string; search: string; body: string; headers: Headers }
let calls: Call[]
let rpcAnswers: Record<string, (body: Record<string, unknown>) => Response>
let storageStatus: number
let tables: Record<string, unknown>
let session: { id: string; name: string; state: string; reason: null } | null

const token = (id: string) => ['eyJhbGciOiJIUzI1NiJ9', Buffer.from(JSON.stringify({ sub: id, exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'), id].join('.')
const ok = (data: unknown) => () => Response.json(data)
const dbError = (code: string, message: string) => () => Response.json({ code, message, details: null, hint: null }, { status: 400 })

beforeEach(() => {
  calls = []
  rpcAnswers = {}
  storageStatus = 200
  tables = {}
  session = { id: 'A', name: 'Pessoa A sintética', state: 'active', reason: null }
  vi.stubEnv('CIRCUITONE_RUNTIME', 'development')
  vi.stubEnv('APP_ORIGIN', origin)
  vi.stubEnv('SUPABASE_URL', SUPABASE)
  vi.stubEnv('SUPABASE_PUBLISHABLE_KEY', 'sb_publishable_synthetic')
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string | Request | URL, init?: RequestInit) => {
      const u = new URL(String(url))
      const method = init?.method ?? 'GET'
      const body = init?.body instanceof Uint8Array ? `[${init.body.byteLength} bytes]` : String(init?.body ?? '')
      calls.push({ method, path: u.pathname, search: u.search, body, headers: new Headers(init?.headers) })
      if (u.pathname === '/auth/v1/token')
        return Response.json({ access_token: token('A'), refresh_token: 'refresh-A', expires_in: 3600, token_type: 'bearer', user: { id: 'A', email: 'a@example.invalid' } })
      if (u.pathname === '/auth/v1/user') return Response.json({ id: 'A', email: 'a@example.invalid' })
      if (u.pathname === '/rest/v1/rpc/get_account_session') return Response.json(session)
      const rpc = /^\/rest\/v1\/rpc\/(.+)$/.exec(u.pathname)?.[1]
      if (rpc) {
        const answer = rpcAnswers[rpc]
        if (!answer) throw new Error('RPC inesperado: ' + rpc)
        return answer(init?.body ? JSON.parse(String(init.body)) : {})
      }
      const table = /^\/rest\/v1\/([a-z_]+)$/.exec(u.pathname)?.[1]
      if (table && table in tables) return Response.json(tables[table], { headers: { 'content-type': 'application/vnd.pgrst.object+json' } })
      if (u.pathname.startsWith('/storage/v1/object/sign/'))
        return storageStatus === 200 ? Response.json({ signedURL: `/object/sign/${u.pathname.split('/sign/')[1]}?token=assinado` }) : Response.json({ message: 'Object not found' }, { status: storageStatus })
      if (u.pathname.startsWith('/storage/v1/object/')) {
        if (storageStatus !== 200) return Response.json({ message: 'recusado', statusCode: String(storageStatus) }, { status: storageStatus })
        return method === 'DELETE' ? Response.json([]) : Response.json({ Id: 'obj', Key: u.pathname.replace('/storage/v1/object/', '') })
      }
      throw new Error('HTTP inesperado: ' + method + ' ' + u.pathname)
    }),
  )
})
afterEach(() => vi.unstubAllEnvs())

const storageCalls = (method: string) => calls.filter((call) => call.method === method && call.path.startsWith('/storage/v1/object/') && !call.path.includes('/sign/'))
const rpcCalls = () => calls.filter((call) => call.path.startsWith('/rest/v1/rpc/') && !call.path.endsWith('get_account_session')).map((call) => call.path.split('/').pop())
const rpcBody = (name: string) => JSON.parse(calls.find((call) => call.path.endsWith('/' + name))!.body) as Record<string, unknown>
const removedPaths = () => storageCalls('DELETE').flatMap((call) => (JSON.parse(call.body) as { prefixes: string[] }).prefixes)

type Outcome = { ok: boolean; message?: string; error?: string; fields?: Record<string, string>; status: number }
const outcome = async (promise: Promise<unknown> | unknown): Promise<Outcome> => {
  const result = (await promise) as { data: Omit<Outcome, 'status'>; init: { status: number } }
  return { ...result.data, status: result.init.status }
}

describe('collectiveProfileAction: imagem do coletivo', () => {
  const path = `/coletivo/${C}/perfil`
  const send = (fields: Record<string, string | File>) => outcome(collectiveProfileAction(multipart(path, fields), C))

  it('envia o arquivo, grava a referência e só então apaga a imagem anterior', async () => {
    rpcAnswers.set_collective_image = ok(OLD(C, 'antiga'))
    const result = await send({ intent: 'upload-image', arquivo: upload(PNG) })
    expect(result).toMatchObject({ ok: true, status: 200, message: 'Imagem do coletivo atualizada.' })
    const [stored] = storageCalls('POST')
    expect(stored.path).toMatch(new RegExp(`^/storage/v1/object/public-images/${C}/[0-9a-f-]{36}\\.png$`))
    expect(stored.headers.get('content-type')).toBe('image/png')
    expect(rpcBody('set_collective_image')).toEqual({ target: C, object_path: stored.path.replace('/storage/v1/object/public-images/', '') })
    // Ordem: upload, RPC, remoção.
    expect(calls.filter((call) => call.path.startsWith('/storage') || call.path.includes('set_collective_image')).map((call) => call.method + ' ' + (call.path.startsWith('/storage') ? 'storage' : 'rpc'))).toEqual(['POST storage', 'POST rpc', 'DELETE storage'])
    expect(removedPaths()).toEqual([OLD(C, 'antiga')])
  })

  it('sem imagem anterior, nada é apagado', async () => {
    rpcAnswers.set_collective_image = ok(null)
    expect(await send({ intent: 'upload-image', arquivo: upload(PNG) })).toMatchObject({ ok: true })
    expect(storageCalls('DELETE')).toEqual([])
  })

  it('o banco recusa a referência: o objeto recém-enviado é descartado e a imagem anterior fica', async () => {
    rpcAnswers.set_collective_image = dbError('42501', 'Operação não autorizada')
    const result = await send({ intent: 'upload-image', arquivo: upload(PNG) })
    expect(result).toMatchObject({ ok: false, status: 403 })
    const [stored] = storageCalls('POST')
    expect(removedPaths()).toEqual([stored.path.replace('/storage/v1/object/public-images/', '')])
  })

  it('arquivo inválido nunca chega ao Storage nem ao banco; a mensagem vai no campo', async () => {
    for (const [file, text] of [
      [upload(PNG, 'a.gif', 'image/gif'), /Formato não aceito/],
      [upload(new Uint8Array(5_000_001)), /5 MB/],
      [upload(PDF, 'a.png'), /conteúdo/],
    ] as const) {
      const result = await send({ intent: 'upload-image', arquivo: file })
      expect(result).toMatchObject({ ok: false, status: 422, error: expect.stringMatching(text), fields: { arquivo: expect.stringMatching(text) } })
    }
    expect(await send({ intent: 'upload-image' })).toMatchObject({ ok: false, status: 422, fields: { arquivo: 'Escolha um arquivo para enviar.' } })
    expect(calls).toEqual([])
  })

  it('falha do Storage vira indisponibilidade e a referência não é gravada', async () => {
    storageStatus = 500
    expect(await send({ intent: 'upload-image', arquivo: upload(PNG) })).toMatchObject({ ok: false, status: 503 })
    expect(rpcCalls()).toEqual([])
  })

  it('remover: caminho nulo no banco e depois apaga o objeto', async () => {
    rpcAnswers.set_collective_image = ok(OLD(C, 'atual'))
    const result = await outcome(collectiveProfileAction(new Request(origin + path, { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'intent=remove-image' }), C))
    expect(result).toMatchObject({ ok: true, message: expect.stringContaining('Imagem removida') })
    expect(rpcBody('set_collective_image')).toEqual({ target: C, object_path: null })
    expect(removedPaths()).toEqual([OLD(C, 'atual')])
  })

  it('a edição de texto continua urlencoded e não mexe no Storage', async () => {
    rpcAnswers.edit_collective = () => new Response(null, { status: 204 })
    const body = new URLSearchParams({ version: '4', description: 'Nova', youtube: '' })
    const result = await outcome(collectiveProfileAction(new Request(origin + path, { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/x-www-form-urlencoded' }, body }), C))
    expect(result).toMatchObject({ ok: true, message: 'Perfil público atualizado.' })
    expect(calls.some((call) => call.path.startsWith('/storage'))).toBe(false)
  })

  it('multipart grande demais: 413 sem tocar no banco', async () => {
    expect(await send({ intent: 'upload-image', arquivo: upload(new Uint8Array(5_300_000)) })).toMatchObject({ ok: false, status: 413 })
    expect(calls).toEqual([])
  })
})

describe('eventManageAction: capa do evento', () => {
  const path = `/coletivo/${C}/eventos/${E}`
  const fields = (extra: Record<string, string | File> = {}) => ({
    intent: 'update', version: '3', name: 'Festa', kind: 'festa', style: 'techno', starts_at: '2030-05-10T20:00', state_code: 'PE', city: 'Recife', venue: 'Pátio', is_free: 'on', ...extra,
  })
  const send = (extra: Record<string, string | File> = {}) => outcome(eventManageAction(multipart(path, fields(extra)), C, E))
  const payload = () => rpcBody('update_event').payload as Record<string, unknown>

  beforeEach(() => {
    rpcAnswers.update_event = () => new Response(null, { status: 204 })
    rpcAnswers.get_event = ok({ id: E, cover_path: OLD(E, 'capa-antiga'), cover_url: null, version: 3 })
  })

  it('arquivo novo: envia, grava o caminho e o tamanho no mesmo update_event, limpa o link e apaga a capa antiga depois', async () => {
    const result = await send({ cover_file: upload(PNG) })
    expect(result).toMatchObject({ ok: true, message: 'Alterações salvas.' })
    const [stored] = storageCalls('POST')
    const uploadedPath = stored.path.replace('/storage/v1/object/public-images/', '')
    expect(uploadedPath).toMatch(new RegExp(`^${E}/[0-9a-f-]{36}\\.png$`))
    expect(payload()).toMatchObject({ cover_path: uploadedPath, cover_bytes: PNG.length, cover_url: null, name: 'Festa' })
    expect(rpcBody('update_event')).toMatchObject({ target: E, expected_version: 3 })
    expect(rpcCalls()).toEqual(['get_event', 'update_event'])
    expect(removedPaths()).toEqual([OLD(E, 'capa-antiga')])
  })

  it('o banco recusa (versão antiga, sem permissão): o arquivo enviado é descartado e a capa antiga fica', async () => {
    rpcAnswers.update_event = dbError('40001', 'Evento alterado; recarregue')
    expect(await send({ cover_file: upload(PNG) })).toMatchObject({ ok: false, status: 409 })
    const [stored] = storageCalls('POST')
    expect(removedPaths()).toEqual([stored.path.replace('/storage/v1/object/public-images/', '')])
  })

  it('arquivo inválido: erro no campo cover_file, sem Storage nem update', async () => {
    expect(await send({ cover_file: upload(PNG, 'a.gif', 'image/gif') })).toMatchObject({ ok: false, status: 422, fields: { cover_file: expect.stringContaining('Formato não aceito') } })
    expect(storageCalls('POST')).toEqual([])
    expect(rpcCalls()).not.toContain('update_event')
  })

  it('remover a capa enviada: caminho e tamanho nulos, e o objeto some', async () => {
    expect(await send({ remove_cover: 'on' })).toMatchObject({ ok: true })
    expect(payload()).toMatchObject({ cover_path: null, cover_bytes: null })
    expect(storageCalls('POST')).toEqual([])
    expect(removedPaths()).toEqual([OLD(E, 'capa-antiga')])
  })

  it('informar um link com capa enviada troca para o link: a capa enviada é removida (o banco não aceita as duas)', async () => {
    expect(await send({ cover_url: 'https://example.invalid/capa.png' })).toMatchObject({ ok: true })
    expect(payload()).toMatchObject({ cover_url: 'https://example.invalid/capa.png', cover_path: null, cover_bytes: null })
    expect(removedPaths()).toEqual([OLD(E, 'capa-antiga')])
  })

  it('salvar sem mexer na capa não toca no Storage nem no caminho', async () => {
    expect(await send()).toMatchObject({ ok: true })
    expect(rpcCalls()).toEqual(['update_event'])
    expect('cover_path' in payload()).toBe(false)
    expect(calls.some((call) => call.path.startsWith('/storage'))).toBe(false)
  })

  it('link novo sem capa enviada anterior só grava o link', async () => {
    rpcAnswers.get_event = ok({ id: E, cover_path: null, cover_url: null, version: 3 })
    expect(await send({ cover_url: 'https://example.invalid/capa.png' })).toMatchObject({ ok: true })
    expect('cover_path' in payload()).toBe(false)
    expect(storageCalls('DELETE')).toEqual([])
  })

  it('publicar e cancelar continuam urlencoded (sem multipart)', async () => {
    rpcAnswers.publish_event = () => new Response(null, { status: 204 })
    const request = new Request(origin + path, { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'intent=publish&version=3' })
    expect(await outcome(eventManageAction(request, C, E))).toMatchObject({ ok: true })
  })
})

describe('profileAction: fotos e documentos (ponta a ponta)', () => {
  const profilePath = `/painel/perfil/${P}`
  const artistRow = (extra: Record<string, unknown> = {}) => ({
    id: P, kind: 'artist', name: 'Artista', description: '', city: 'Recife', state_code: 'PE', social_links: {}, color: null, published: false, is_default: false,
    styles: [{ style: 'techno', substyle: null }], images: [],
    professional: { booking_email: null, contact_email: null, contact_phone: null, fee_cents: null, cnpj: null, service_type: null, service_other: null, audiovisual_type: null, presskit_url: null, portfolio_url: null, presskit_path: null, presskit_bytes: null, services_pdf_path: null, services_pdf_bytes: null },
    ...extra,
  })
  const signIn = async () => {
    const response = await loginAction(new Request(origin + '/entrar', { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ email: 'a@example.invalid', password: 'synthetic-password' }) }))
    calls = []
    return response.headers.getSetCookie().map((value) => value.split(';')[0]).join('; ')
  }
  const send = async (fields: Record<string, string | File>, headers: Record<string, string> = {}) => outcome(profileAction(multipart(profilePath, fields, { Cookie: await signIn(), ...headers }), P)) as Promise<Outcome & { errors?: Record<string, string>; intent?: string }>

  it('foto principal: envia, liga com attach_profile_image (slot main) e apaga a foto substituída', async () => {
    rpcAnswers.get_my_profile = ok(artistRow())
    rpcAnswers.attach_profile_image = ok({ id: 'i', position: 0, replaced_path: OLD(P, 'antiga') })
    const result = await send({ intent: 'upload-photo', arquivo: upload(PNG) })
    expect(result).toMatchObject({ ok: true, status: 200, intent: 'upload-photo', message: 'Foto principal atualizada.' })
    const [stored] = storageCalls('POST')
    expect(stored.path).toMatch(new RegExp(`^/storage/v1/object/public-images/${P}/[0-9a-f-]{36}\\.png$`))
    expect(rpcBody('attach_profile_image')).toEqual({ target: P, slot: 'main', object_path: stored.path.replace('/storage/v1/object/public-images/', '') })
    expect(removedPaths()).toEqual([OLD(P, 'antiga')])
  })

  it('galeria: slot gallery; cheia (10) recusa antes do Storage; erro do banco descarta o objeto', async () => {
    rpcAnswers.get_my_profile = ok(artistRow())
    rpcAnswers.attach_profile_image = ok({ id: 'i', position: 1, replaced_path: null })
    expect(await send({ intent: 'upload-gallery', arquivo: upload(PNG) })).toMatchObject({ ok: true, message: 'Imagem adicionada à galeria.' })
    expect(rpcBody('attach_profile_image')).toMatchObject({ slot: 'gallery' })
    expect(storageCalls('DELETE')).toEqual([])

    const images = Array.from({ length: 10 }, (_, i) => ({ id: `0300000${i}-0000-4000-8000-000000000000`, position: i + 1, object_path: OLD(P, `g${i}`), size_bytes: 10, alt_text: '' }))
    rpcAnswers.get_my_profile = ok(artistRow({ images }))
    calls = []
    const full = await send({ intent: 'upload-gallery', arquivo: upload(PNG) })
    expect(full).toMatchObject({ ok: false, status: 409, errors: { arquivo: expect.stringContaining('até 10 imagens') } })
    expect(storageCalls('POST')).toEqual([])

    rpcAnswers.get_my_profile = ok(artistRow())
    rpcAnswers.attach_profile_image = dbError('22023', 'Imagem inválida')
    calls = []
    expect(await send({ intent: 'upload-gallery', arquivo: upload(PNG) })).toMatchObject({ ok: false, status: 400 })
    expect(removedPaths()).toHaveLength(1)
  })

  it('arquivo inválido: erro no campo arquivo, sem Storage', async () => {
    rpcAnswers.get_my_profile = ok(artistRow())
    const result = await send({ intent: 'upload-photo', arquivo: upload(PDF, 'a.png') })
    expect(result).toMatchObject({ ok: false, status: 422, intent: 'upload-photo', errors: { arquivo: expect.stringContaining('conteúdo') } })
    expect(calls.some((call) => call.path.startsWith('/storage'))).toBe(false)
  })

  it('só artistas têm fotos; só artista e serviços têm documento', async () => {
    rpcAnswers.get_my_profile = ok(artistRow({ kind: 'audiovisual', styles: [] }))
    expect(await send({ intent: 'upload-photo', arquivo: upload(PNG) })).toMatchObject({ ok: false, status: 400 })
    expect(await send({ intent: 'upload-document', arquivo: upload(PDF, 'a.pdf', 'application/pdf') })).toMatchObject({ ok: false, status: 400, message: expect.stringContaining('não tem documento') })
    rpcAnswers.get_my_profile = ok(artistRow({ kind: 'member', styles: [], professional: null }))
    expect(await send({ intent: 'upload-document', arquivo: upload(PDF, 'a.pdf', 'application/pdf') })).toMatchObject({ ok: false, status: 400 })
    expect(calls.some((call) => call.path.startsWith('/storage'))).toBe(false)
  })

  it('presskit em PDF (artista): bucket privado, RPC kind presskit e remoção do anterior', async () => {
    rpcAnswers.get_my_profile = ok(artistRow())
    rpcAnswers.set_professional_document = ok(OLD(P, 'kit-antigo', 'pdf'))
    const result = await send({ intent: 'upload-document', arquivo: upload(PDF, 'meu-kit.pdf', 'application/pdf') })
    expect(result).toMatchObject({ ok: true, intent: 'upload-document', message: expect.stringContaining('Presskit em PDF enviado') })
    const [stored] = storageCalls('POST')
    expect(stored.path).toMatch(new RegExp(`^/storage/v1/object/private-documents/${P}/[0-9a-f-]{36}\\.pdf$`))
    expect(rpcBody('set_professional_document')).toEqual({ target: P, kind: 'presskit', object_path: stored.path.replace('/storage/v1/object/private-documents/', '') })
    expect(storageCalls('DELETE')[0].path).toBe('/storage/v1/object/private-documents')
    expect(removedPaths()).toEqual([OLD(P, 'kit-antigo', 'pdf')])
  })

  it('lista de serviços (serviços): kind services; remover envia caminho nulo', async () => {
    rpcAnswers.get_my_profile = ok(artistRow({ kind: 'services', styles: [] }))
    rpcAnswers.set_professional_document = ok(null)
    expect(await send({ intent: 'upload-document', arquivo: upload(PDF, 'lista.pdf', 'application/pdf') })).toMatchObject({ ok: true, message: expect.stringContaining('Lista de serviços') })
    expect(rpcBody('set_professional_document')).toMatchObject({ kind: 'services' })
    rpcAnswers.set_professional_document = ok(OLD(P, 'lista', 'pdf'))
    calls = []
    expect(await send({ intent: 'remove-document' })).toMatchObject({ ok: true, message: 'Documento removido.' })
    expect(rpcBody('set_professional_document')).toEqual({ target: P, kind: 'services', object_path: null })
    expect(removedPaths()).toEqual([OLD(P, 'lista', 'pdf')])
  })

  it('remover foto/imagem, mover na galeria: RPC e remoção do objeto; entrada inválida não chega ao banco', async () => {
    const IMG = '03000000-0000-4000-8000-000000000001'
    rpcAnswers.get_my_profile = ok(artistRow())
    rpcAnswers.detach_profile_image = ok(OLD(P, 'tirar'))
    expect(await send({ intent: 'remove-gallery', imagem: IMG })).toMatchObject({ ok: true, message: 'Imagem removida da galeria.' })
    expect(rpcBody('detach_profile_image')).toEqual({ target: P, image: IMG })
    expect(removedPaths()).toEqual([OLD(P, 'tirar')])
    expect(await send({ intent: 'remove-photo', imagem: IMG })).toMatchObject({ ok: true, message: 'Foto principal removida.' })
    rpcAnswers.move_profile_image = () => new Response(null, { status: 204 })
    calls = []
    expect(await send({ intent: 'move-gallery', imagem: IMG, direcao: 'later' })).toMatchObject({ ok: true })
    expect(rpcBody('move_profile_image')).toEqual({ target: P, image: IMG, direction: 'later' })
    calls = []
    expect(await send({ intent: 'move-gallery', imagem: IMG, direcao: 'sideways' })).toMatchObject({ ok: false, status: 400 })
    expect(await send({ intent: 'remove-gallery', imagem: 'não-é-uuid' })).toMatchObject({ ok: false, status: 400 })
    // `send` entra de novo a cada chamada (zera o registro): sobra só a última, que parou na validação.
    expect(rpcCalls()).toEqual(['get_my_profile'])
  })

  it('remoção recusada pelo banco não apaga o objeto', async () => {
    rpcAnswers.get_my_profile = ok(artistRow())
    rpcAnswers.detach_profile_image = dbError('22023', 'Imagem indisponível')
    expect(await send({ intent: 'remove-gallery', imagem: '03000000-0000-4000-8000-000000000001' })).toMatchObject({ ok: false, status: 400, message: 'Imagem indisponível' })
    expect(storageCalls('DELETE')).toEqual([])
  })

  it('atuação de outra conta: 404 sem tocar no Storage', async () => {
    rpcAnswers.get_my_profile = ok(null)
    const cookie = await signIn()
    await expect(profileAction(multipart(profilePath, { intent: 'upload-photo', arquivo: upload(PNG) }, { Cookie: cookie }), P)).rejects.toMatchObject({ init: { status: 404 } })
    expect(calls.some((call) => call.path.startsWith('/storage'))).toBe(false)
  })

  it('origem externa e visitante: recusados antes de qualquer acesso', async () => {
    const cookie = await signIn()
    const denied = await outcome(profileAction(multipart(profilePath, { intent: 'upload-photo', arquivo: upload(PNG) }, { Cookie: cookie, Origin: 'https://attacker.invalid' }), P))
    expect(denied).toMatchObject({ ok: false, status: 403 })
    expect(calls).toEqual([])
    const anonymous = (await profileAction(multipart(profilePath, { intent: 'upload-photo', arquivo: upload(PNG) }), P)) as Response
    expect(anonymous.status).toBe(303)
    expect(anonymous.headers.get('location')).toBe('/entrar')
    expect(calls.some((call) => call.path.startsWith('/storage'))).toBe(false)
  })

  it('arquivo acima de 10 MB (limite do multipart) responde 413 sem consultar o banco', async () => {
    const result = await send({ intent: 'upload-document', arquivo: upload(new Uint8Array(10_100_000), 'a.pdf', 'application/pdf') })
    expect(result).toMatchObject({ ok: false, status: 413 })
    expect(rpcCalls()).toEqual([])
  })

  it('a conferência de presskit: link junto com PDF enviado é recusado no campo', async () => {
    rpcAnswers.get_my_profile = ok(artistRow({ professional: { ...artistRow().professional, presskit_path: OLD(P, 'kit', 'pdf'), presskit_bytes: 2000 } }))
    const cookie = await signIn()
    const body = new URLSearchParams({ intent: 'save-professional', presskit: 'https://example.invalid/kit' })
    const request = new Request(origin + profilePath, { method: 'POST', headers: { Origin: origin, Cookie: cookie, 'Content-Type': 'application/x-www-form-urlencoded' }, body })
    const result = (await outcome(profileAction(request, P))) as Outcome & { errors?: Record<string, string> }
    expect(result).toMatchObject({ ok: false, errors: { presskit: expect.stringContaining('Remova o PDF') } })
    expect(rpcCalls()).toEqual(['get_my_profile'])
  })
})

describe('openDocument: abre o PDF privado com um endereço assinado de poucos segundos', () => {
  const request = (cookie?: string) => new Request(`${origin}/painel/documentos/${P}/presskit`, { headers: cookie ? { Cookie: cookie } : {} })
  const signIn = async () => {
    const response = await loginAction(new Request(origin + '/entrar', { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ email: 'a@example.invalid', password: 'synthetic-password' }) }))
    calls = []
    return response.headers.getSetCookie().map((value) => value.split(';')[0]).join('; ')
  }

  it('redireciona (302, sem cache) para o endereço assinado do caminho lido do banco', async () => {
    tables.professional_details = { presskit_path: OLD(P, 'kit', 'pdf') }
    const response = await openDocument(request(await signIn()), P, 'presskit')
    expect(response.status).toBe(302)
    expect(response.headers.get('location')).toBe(`${SUPABASE}/storage/v1/object/sign/private-documents/${P}/kit.pdf?token=assinado`)
    expect(response.headers.get('cache-control')).toContain('no-store')
    const signed = calls.find((call) => call.path.startsWith('/storage/v1/object/sign/'))!
    expect(JSON.parse(signed.body)).toEqual({ expiresIn: SIGNED_URL_SECONDS })
    expect(SIGNED_URL_SECONDS).toBeLessThanOrEqual(120)
    expect(calls.find((call) => call.path === '/rest/v1/professional_details')!.search).toContain('select=presskit_path')
  })

  it('lista de serviços usa a outra coluna', async () => {
    tables.professional_details = { services_pdf_path: OLD(P, 'lista', 'pdf') }
    const response = await openDocument(new Request(`${origin}/painel/documentos/${P}/lista-servicos`, { headers: { Cookie: await signIn() } }), P, 'lista-servicos')
    expect(response.status).toBe(302)
    expect(calls.find((call) => call.path === '/rest/v1/professional_details')!.search).toContain('select=services_pdf_path')
  })

  it('sem sessão: login; conta restrita: 403', async () => {
    const anonymous = await openDocument(request(), P, 'presskit')
    expect(anonymous.status).toBe(303)
    expect(anonymous.headers.get('location')).toBe('/entrar')
    session = { id: 'A', name: 'x', state: 'suspended', reason: null }
    expect((await openDocument(request(await signIn()), P, 'presskit')).status).toBe(403)
    expect(calls.some((call) => call.path.startsWith('/storage'))).toBe(false)
  })

  it('id ou tipo inválido: 404 sem consultar nada', async () => {
    expect((await openDocument(request(), 'x', 'presskit')).status).toBe(404)
    expect((await openDocument(request(), P, 'portfolio')).status).toBe(404)
    expect((await openDocument(request(), P, '__proto__')).status).toBe(404)
    expect(calls).toEqual([])
  })

  it('sem linha profissional visível (RLS), sem arquivo ou política negando o objeto: 404 igual', async () => {
    const cookie = await signIn()
    tables.professional_details = null
    expect((await openDocument(request(cookie), P, 'presskit')).status).toBe(404)
    tables.professional_details = { presskit_path: null }
    expect((await openDocument(request(cookie), P, 'presskit')).status).toBe(404)
    tables.professional_details = { presskit_path: OLD(P, 'kit', 'pdf') }
    storageStatus = 400
    expect((await openDocument(request(cookie), P, 'presskit')).status).toBe(404)
  })

  it('falha do banco: 503', async () => {
    const cookie = await signIn()
    vi.mocked(fetch).mockImplementation(async () => {
      throw new Error('detalhe interno')
    })
    const response = await openDocument(request(cookie), P, 'presskit')
    expect(response.status).toBe(503)
    expect(await response.text()).not.toContain('detalhe interno')
  })
})
