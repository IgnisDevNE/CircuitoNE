// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { serveImage } from '../../src/server/image.server'

const SUPABASE = 'https://synthetic.supabase.test'
const ID = '02000000-0000-4000-8000-000000000001'
const PATH = `${ID}/foto.png`
const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4])

type Seen = { url: string; headers: Headers }
let seen: Seen[] = []
let answer: () => Response | Promise<Response> = () => new Response(PNG, { status: 200, headers: { 'Content-Type': 'image/png' } })

const get = (path: string | undefined, init: RequestInit & { cookie?: string } = {}) =>
  serveImage(new Request(`https://circuitone-dev.magalz.space/img/${path ?? ''}`, { ...init, headers: init.cookie ? { Cookie: init.cookie } : {} }), path)

beforeEach(() => {
  seen = []
  answer = () => new Response(PNG, { status: 200, headers: { 'Content-Type': 'image/png' } })
  vi.stubEnv('CIRCUITONE_RUNTIME', 'development')
  vi.stubEnv('SUPABASE_URL', SUPABASE)
  vi.stubEnv('SUPABASE_PUBLISHABLE_KEY', 'sb_publishable_synthetic')
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      seen.push({ url: String(input instanceof Request ? input.url : input), headers: new Headers(init?.headers) })
      return answer()
    }),
  )
})
afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe('serveImage: imagens do bucket privado public-images', () => {
  it('baixa o objeto e responde com o tipo, o tamanho e os cabeçalhos de segurança', async () => {
    const response = await get(PATH)
    expect(response.status).toBe(200)
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(PNG)
    expect(response.headers.get('content-type')).toBe('image/png')
    expect(response.headers.get('content-length')).toBe(String(PNG.length))
    expect(response.headers.get('cache-control')).toBe('private, max-age=300')
    expect(response.headers.get('x-content-type-options')).toBe('nosniff')
    expect(response.headers.get('cross-origin-resource-policy')).toBe('same-origin')
    expect(response.headers.get('vary')).toBe('Cookie')
    expect(seen).toHaveLength(1)
    expect(seen[0].url).toBe(`${SUPABASE}/storage/v1/object/public-images/${PATH}`)
  })

  it('aceita jpeg e webp e ignora parâmetros do tipo', async () => {
    for (const type of ['image/jpeg', 'image/webp', 'image/png; charset=binary']) {
      answer = () => new Response(PNG, { status: 200, headers: { 'Content-Type': type } })
      const response = await get(`${ID}/a.jpg`)
      expect(response.status).toBe(200)
      expect(response.headers.get('content-type')).toBe(type.split(';')[0])
    }
  })

  it('HEAD devolve os cabeçalhos sem corpo; outros métodos, 404', async () => {
    const head = await get(PATH, { method: 'HEAD' })
    expect(head.status).toBe(200)
    expect(head.headers.get('content-length')).toBe(String(PNG.length))
    expect(await head.text()).toBe('')
    expect((await get(PATH, { method: 'POST', body: 'x' })).status).toBe(404)
    expect((await get(PATH, { method: 'DELETE' })).status).toBe(404)
  })

  it('caminho fora do formato das constraints: 404 sem falar com o Storage', async () => {
    for (const bad of [undefined, '', 'foto.png', `${ID}/sub/foto.png`, `${ID}/foto.gif`, `${ID}/foto.svg`, `${ID}/foto.pdf`, '../etc/passwd', `${ID}/../${ID}/foto.png`, `${ID}/%2e%2e.png`, '0A000000-0000-4000-8000-000000000001/foto.png', `${ID}/foto.png?x=1`]) {
      const response = await get(bad)
      expect(response.status, String(bad)).toBe(404)
      expect(await response.text()).toBe('Not found')
    }
    expect(seen).toEqual([])
  })

  it('tipo fora de jpeg, png e webp (inclusive html e svg): 404', async () => {
    for (const type of ['text/html', 'image/svg+xml', 'application/octet-stream', 'application/pdf', 'image/gif', '']) {
      answer = () => new Response(PNG, { status: 200, headers: type ? { 'Content-Type': type } : {} })
      expect((await get(PATH)).status, type).toBe(404)
    }
  })

  it('recusa da política, objeto ausente e falha do Storage: 404 igual, sem detalhe e sem cache', async () => {
    for (const status of [400, 401, 403, 404, 500, 503]) {
      answer = () => new Response(JSON.stringify({ message: 'detalhe interno', error: 'not_found' }), { status, headers: { 'Content-Type': 'application/json' } })
      const response = await get(PATH)
      expect(response.status, String(status)).toBe(404)
      expect(await response.text()).toBe('Not found')
      expect(response.headers.get('cache-control')).toContain('no-store')
      expect(response.headers.get('x-content-type-options')).toBe('nosniff')
    }
    answer = () => {
      throw new Error('rede')
    }
    expect((await get(PATH)).status).toBe(404)
  })

  it('sem configuração do Supabase: 404', async () => {
    vi.stubEnv('SUPABASE_URL', '')
    expect((await get(PATH)).status).toBe(404)
  })

  it('o cookie de sessão é repassado ao Storage (dono vê o rascunho); sem cookie vai como visitante', async () => {
    const token = 'header.payload.signature'
    const cookie = `sb-synthetic-auth-token=${encodeURIComponent(JSON.stringify({ access_token: token, refresh_token: 'r', expires_at: Math.floor(Date.now() / 1000) + 3600, expires_in: 3600, token_type: 'bearer', user: { id: ID } }))}`
    await get(PATH, { cookie })
    expect(seen[0].headers.get('authorization')).toContain(token)
    seen = []
    await get(PATH)
    expect(seen[0].headers.get('authorization') ?? '').not.toContain(token)
  })
})
