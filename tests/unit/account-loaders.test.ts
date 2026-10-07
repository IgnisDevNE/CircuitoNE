// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  appLayoutLoader,
  headerSessionLoader,
  loadAppLayout,
  loadDashboard,
} from '../../src/server/account.server'
import { hasAuthCookie, loginAction } from '../../src/server/auth.server'
import type { SupabaseServerClient } from '../../src/server/supabase.server'

type Result = { data: unknown; error: unknown }
const ok = (data: unknown): Result => ({ data, error: null })
const failure: Result = { data: null, error: { message: 'boom', code: 'PGRST000' } }

const profile = (extra = {}) => ({
  id: '02000000-0000-4000-8000-000000000001', kind: 'artist', name: 'Artista sintético público',
  city: 'Recife', state_code: 'PE', published: true, is_default: true, ...extra,
})
const collective = (extra = {}) => ({
  id: '05000000-0000-4000-8000-000000000001', kind: 'collective', name: 'Organização sintética 1',
  city: 'Recife', state_code: 'PE', state: 'approved', role_name: 'Membro', is_owner: true, ...extra,
})
const event = (n: number, extra = {}) => ({
  id: `0a000000-0000-4000-8000-00000000000${n}`, collective_id: '05000000-0000-4000-8000-000000000001',
  name: `Evento sintético ${n}`, kind: 'festa', starts_at: `2026-10-0${n}T15:00:00+00:00`, ends_at: null,
  timezone: 'America/Fortaleza', city: 'Recife', state_code: 'PE', venue: 'Local sintético', is_free: true,
  ticket_url: null, cover_url: null, cover_path: null, rescheduled_at: null, ...extra,
})

const session = (state = 'active', extra = {}) => ({ id: 'A', name: 'Pessoa A sintética', state, reason: null, ...extra })

/** Fake client: `auth.getUser` and RPCs answered from a table keyed by function name (list_events by period+artist). */
function fakeClient(opts: {
  user?: { id: string } | null
  userError?: unknown
  rpc?: Record<string, Result>
}) {
  const rpc = vi.fn(async (name: string, args?: { period?: string; artist?: string }) => {
    const key = name === 'list_events' ? `list_events:${args?.period}:${args?.artist}` : name
    const entry = opts.rpc?.[key]
    if (!entry) throw new Error(`rpc inesperado: ${key}`)
    return entry
  })
  const getUser = vi.fn(async () => ({
    data: { user: opts.user === undefined ? { id: 'A' } : opts.user },
    error: opts.userError ?? null,
  }))
  return { client: { auth: { getUser }, rpc } as unknown as SupabaseServerClient, rpc, getUser }
}

const request = (cookie = '') => new Request('https://circuitone-dev.magalz.space/painel', { headers: cookie ? { Cookie: cookie } : {} })

describe('loadAppLayout', () => {
  const lists = {
    list_my_profiles: ok([profile(), profile({ id: 'b', kind: 'services', name: 'Serviços sintéticos', published: false, is_default: false })]),
    list_my_collectives: ok([collective()]),
    list_conversations: ok([{ unread_count: 2 }, { unread_count: 1 }]),
  }

  it('visitante sem sessão: anônimo, sem consultar RPCs', async () => {
    const { client, rpc } = fakeClient({ user: null, userError: { name: 'AuthSessionMissingError', status: 400 } })
    expect(await loadAppLayout(client, request(), new Headers())).toEqual({ kind: 'anonymous' })
    expect(rpc).not.toHaveBeenCalled()
  })

  it('conta ativa: nome vem da conta, nunca de metadados; traz atuações, coletivos e não lidas', async () => {
    const { client, getUser, rpc } = fakeClient({ rpc: { get_account_session: ok(session()), ...lists } })
    const result = await loadAppLayout(client, request(), new Headers())
    expect(result).toEqual({
      kind: 'ok',
      data: {
        status: 'active',
        nome: 'Pessoa A sintética',
        perfis: [
          expect.objectContaining({ tipo: 'artista', nome: 'Artista sintético público', publicado: true, padrao: true }),
          expect.objectContaining({ tipo: 'servicos', publicado: false }),
        ],
        coletivos: [expect.objectContaining({ nome: 'Organização sintética 1', cargo: 'Membro', dono: true, situacao: 'approved' })],
        naoLidas: 3,
      },
    })
    expect(getUser).toHaveBeenCalledTimes(1)
    expect(rpc).toHaveBeenCalledWith('get_account_session')
  })

  it.each([
    ['suspended', 'Revisão sintética'],
    ['deletion_pending', null],
    ['incomplete', null],
  ] as const)('conta %s: só o aviso restrito, nenhuma lista é consultada', async (state, reason) => {
    const { client, rpc } = fakeClient({ rpc: { get_account_session: ok(session(state, { reason })) } })
    expect(await loadAppLayout(client, request(), new Headers())).toEqual({
      kind: 'ok',
      data: { status: 'restricted', nome: 'Pessoa A sintética', situacao: state, motivo: reason },
    })
    expect(rpc).toHaveBeenCalledTimes(1)
  })

  it('conta sem nome (cadastro incompleto) usa o nome genérico no menu, e nulo no aviso', async () => {
    const active = fakeClient({ rpc: { get_account_session: ok(session('active', { name: null })), ...lists } })
    expect(await loadAppLayout(active.client, request(), new Headers())).toMatchObject({ data: { nome: 'Minha conta' } })
    const incomplete = fakeClient({ rpc: { get_account_session: ok(session('incomplete', { name: null })) } })
    expect(await loadAppLayout(incomplete.client, request(), new Headers())).toMatchObject({ data: { nome: null } })
  })

  it('identidade invalidada (RPC nulo) limpa os cookies de Auth e vira visitante', async () => {
    vi.stubEnv('SUPABASE_URL', 'https://odphoxozclrshqjgwbqk.supabase.co')
    const headers = new Headers()
    const { client } = fakeClient({ rpc: { get_account_session: ok(null) } })
    const result = await loadAppLayout(client, request('sb-odphoxozclrshqjgwbqk-auth-token=x; outro=1'), headers)
    expect(result).toEqual({ kind: 'anonymous' })
    expect(headers.getSetCookie().join('\n')).toMatch(/sb-odphoxozclrshqjgwbqk-auth-token=;.*Max-Age=0/i)
    expect(headers.getSetCookie().join('\n')).not.toContain('outro')
    vi.unstubAllEnvs()
  })

  it('conta de outra identidade ou estado desconhecido é recusada', async () => {
    const other = fakeClient({ rpc: { get_account_session: ok(session('active', { id: 'B' })) } })
    await expect(loadAppLayout(other.client, request(), new Headers())).rejects.toMatchObject({ status: 503 })
    const unknown = fakeClient({ rpc: { get_account_session: ok(session('admin')) } })
    await expect(loadAppLayout(unknown.client, request(), new Headers())).rejects.toMatchObject({ status: 503 })
  })

  it('falhas viram 503 e nunca listas vazias nem visitante', async () => {
    const auth = fakeClient({ userError: { name: 'AuthRetryableFetchError', status: 500 }, user: null })
    await expect(loadAppLayout(auth.client, request(), new Headers())).rejects.toMatchObject({ status: 503 })
    const rpcFail = fakeClient({ rpc: { get_account_session: failure } })
    await expect(loadAppLayout(rpcFail.client, request(), new Headers())).rejects.toMatchObject({ status: 503 })
    for (const broken of ['list_my_profiles', 'list_my_collectives', 'list_conversations']) {
      const { client } = fakeClient({ rpc: { get_account_session: ok(session()), ...lists, [broken]: failure } })
      await expect(loadAppLayout(client, request(), new Headers())).rejects.toMatchObject({ status: 503 })
    }
    const malformed = fakeClient({ rpc: { get_account_session: ok(session()), ...lists, list_conversations: ok({}) } })
    await expect(loadAppLayout(malformed.client, request(), new Headers())).rejects.toThrow('Resposta inválida')
  })
})

describe('loadDashboard', () => {
  const rpc = (extra: Record<string, Result>) => ({
    list_my_profiles: ok([
      profile(),
      profile({ id: 'art-2', name: 'Segundo projeto' }),
      profile({ id: 'art-draft', name: 'Rascunho', published: false }),
      profile({ id: 'svc', kind: 'services', name: 'Serviços sintéticos', published: false }),
    ]),
    ...extra,
  })
  const a1 = '02000000-0000-4000-8000-000000000001'

  it('busca eventos só dos artistas publicados, em andamento antes de futuros, sem duplicar eventos', async () => {
    const { client, rpc: spy } = fakeClient({
      rpc: rpc({
        [`list_events:ongoing:${a1}`]: ok([event(2)]),
        [`list_events:future:${a1}`]: ok([event(5), event(3)]),
        'list_events:ongoing:art-2': ok([]),
        'list_events:future:art-2': ok([event(3), event(4)]),
      }),
    })
    const { proximos } = await loadDashboard(client)
    expect(proximos.map((p) => [p.evento.nome, p.como])).toEqual([
      ['Evento sintético 2', ['Artista sintético público']],
      ['Evento sintético 3', ['Artista sintético público', 'Segundo projeto']],
      ['Evento sintético 4', ['Segundo projeto']],
      ['Evento sintético 5', ['Artista sintético público']],
    ])
    const queried = spy.mock.calls.filter(([name]) => name === 'list_events').map(([, args]) => (args as { artist: string }).artist)
    expect(new Set(queried)).toEqual(new Set([a1, 'art-2']))
    expect(queried).toHaveLength(4)
  })

  it('sem atuação artística publicada não consulta eventos e devolve lista vazia', async () => {
    const { client, rpc: spy } = fakeClient({ rpc: { list_my_profiles: ok([profile({ published: false }), profile({ id: 'x', kind: 'member' })]) } })
    expect(await loadDashboard(client)).toEqual({ proximos: [] })
    expect(spy).toHaveBeenCalledTimes(1)
  })

  it('erro em qualquer consulta vira 503', async () => {
    const { client } = fakeClient({
      rpc: rpc({ [`list_events:ongoing:${a1}`]: ok([]), [`list_events:future:${a1}`]: failure, 'list_events:ongoing:art-2': ok([]), 'list_events:future:art-2': ok([]) }),
    })
    await expect(loadDashboard(client)).rejects.toMatchObject({ status: 503 })
    const { client: noProfiles } = fakeClient({ rpc: { list_my_profiles: failure } })
    await expect(loadDashboard(noProfiles)).rejects.toMatchObject({ status: 503 })
  })
})

describe('hasAuthCookie', () => {
  it.each([
    ['sb-odphoxozclrshqjgwbqk-auth-token=abc', true],
    ['x=1; sb-127-auth-token.0=abc; sb-127-auth-token.1=def', true],
    ['sb-127-auth-token-code-verifier=abc', false],
    ['theme=dark; session=1', false],
    ['', false],
  ])('%s', (cookie, expected) => {
    expect(hasAuthCookie(request(cookie))).toBe(expected)
  })
})

describe('loaders de rota com Supabase simulado', () => {
  const origin = 'https://circuitone-dev.magalz.space'
  let calls: string[]
  let state = 'active'
  const token = (id: string) =>
    ['eyJhbGciOiJIUzI1NiJ9', Buffer.from(JSON.stringify({ sub: id, exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'), id].join('.')

  beforeEach(() => {
    calls = []
    state = 'active'
    vi.stubEnv('CIRCUITONE_RUNTIME', 'development')
    vi.stubEnv('APP_ORIGIN', origin)
    vi.stubEnv('SUPABASE_URL', 'https://odphoxozclrshqjgwbqk.supabase.co')
    vi.stubEnv('SUPABASE_PUBLISHABLE_KEY', 'sb_publishable_synthetic')
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string | Request | URL, options?: RequestInit) => {
        const u = new URL(String(url))
        calls.push(u.pathname)
        const authorization = new Headers(options?.headers).get('authorization') ?? ''
        if (u.pathname === '/auth/v1/token')
          return Response.json({
            access_token: token('A'), refresh_token: 'refresh-A', expires_in: 3600, token_type: 'bearer',
            user: { id: 'A', email: 'a@example.invalid', user_metadata: { name: 'NÃO CONFIAR' } },
          })
        if (u.pathname === '/auth/v1/user')
          return authorization.endsWith('.A') ? Response.json({ id: 'A', email: 'a@example.invalid' }) : Response.json({ message: 'invalid JWT' }, { status: 401 })
        if (u.pathname === '/rest/v1/rpc/get_account_session')
          return Response.json(session(state, { reason: state === 'suspended' ? 'Análise sintética' : null }))
        if (u.pathname === '/rest/v1/rpc/list_my_profiles') return Response.json([profile()])
        if (u.pathname === '/rest/v1/rpc/list_my_collectives') return Response.json([collective()])
        if (u.pathname === '/rest/v1/rpc/list_conversations') return Response.json([{ unread_count: 4 }])
        throw new Error(`HTTP inesperado: ${u.pathname}`)
      }),
    )
  })
  afterEach(() => vi.unstubAllEnvs())

  const login = async () => {
    const response = await loginAction(
      new Request(origin + '/entrar', {
        method: 'POST',
        headers: { Origin: origin, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ email: 'a@example.invalid', password: 'synthetic-password' }),
      }),
    )
    expect(response.status).toBe(303)
    return response.headers.getSetCookie().map((value) => value.split(';')[0]).join('; ')
  }
  const req = (cookie = '') => new Request(origin + '/painel', { headers: cookie ? { Cookie: cookie } : {} })

  it('visitante é redirecionado para /entrar com resposta privada, sem tocar nas RPCs', async () => {
    const thrown = await appLayoutLoader(req()).then(() => null, (error) => error as Response)
    expect(thrown).toBeInstanceOf(Response)
    expect(thrown!.status).toBe(302)
    expect(thrown!.headers.get('location')).toBe('/entrar')
    expect(thrown!.headers.get('cache-control')).toContain('no-store')
    expect(thrown!.headers.get('vary')).toBe('Cookie')
    expect(calls.filter((path) => path.startsWith('/rest/'))).toEqual([])
  })

  it('cookie forjado nunca vira sessão: o servidor valida com Auth e recusa', async () => {
    const forged = `sb-odphoxozclrshqjgwbqk-auth-token=${encodeURIComponent(JSON.stringify({ access_token: token('X'), refresh_token: 'r', expires_at: 9999999999, user: { id: 'A' } }))}`
    const thrown = await appLayoutLoader(req(forged)).then(() => null, (error) => error as Response)
    expect(thrown!.status).toBe(302)
    expect(thrown!.headers.get('location')).toBe('/entrar')
  })

  it('conta ativa recebe os dados do shell com cabeçalhos privados', async () => {
    const result = (await appLayoutLoader(req(await login()))) as { data: unknown; init: { headers: Headers } }
    expect(result.data).toMatchObject({ status: 'active', nome: 'Pessoa A sintética', naoLidas: 4 })
    expect(result.init.headers.get('cache-control')).toContain('private, no-store')
    expect(result.init.headers.get('vary')).toBe('Cookie')
  })

  it('conta suspensa recebe o aviso restrito', async () => {
    const cookie = await login()
    state = 'suspended'
    const result = (await appLayoutLoader(req(cookie))) as { data: unknown }
    expect(result.data).toEqual({ status: 'restricted', nome: 'Pessoa A sintética', situacao: 'suspended', motivo: 'Análise sintética' })
  })

  it('falha do serviço vira erro 503 privado, nunca redirecionamento', async () => {
    const cookie = await login()
    vi.stubGlobal('fetch', vi.fn(async () => new Response('boom', { status: 500 })))
    const thrown = await appLayoutLoader(req(cookie)).then(() => null, (error) => error)
    expect(thrown).toMatchObject({ type: 'DataWithResponseInit', init: { status: 503 } })
    expect(thrown.init.headers.get('cache-control')).toContain('no-store')
  })

  it('cabeçalho público: sem cookies de Auth não faz nenhuma chamada', async () => {
    const result = (await headerSessionLoader(req('tema=escuro'))) as { data: unknown }
    expect(result.data).toEqual({ signedIn: false, name: null })
    expect(calls).toEqual([])
  })

  it('cabeçalho público: sessão válida mostra "logado" com o nome da conta, validado no servidor', async () => {
    const result = (await headerSessionLoader(req(await login()))) as { data: unknown; init: { headers: Headers } }
    expect(result.data).toEqual({ signedIn: true, name: 'Pessoa A sintética' })
    expect(result.init.headers.get('cache-control')).toContain('no-store')
    expect(calls).toContain('/auth/v1/user')
  })

  it('cabeçalho público: cookie recusado pelo Auth continua visitante, e erros não derrubam a página', async () => {
    const cookie = await login()
    const forged = `sb-odphoxozclrshqjgwbqk-auth-token=${encodeURIComponent(JSON.stringify({ access_token: token('X'), refresh_token: 'r', expires_at: 9999999999, user: { id: 'A' } }))}`
    expect(((await headerSessionLoader(req(forged))) as { data: unknown }).data).toEqual({ signedIn: false, name: null })
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('rede fora') }))
    expect(((await headerSessionLoader(req(cookie))) as { data: unknown }).data).toEqual({ signedIn: false, name: null })
  })
})
