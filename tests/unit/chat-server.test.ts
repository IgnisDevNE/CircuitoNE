// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { loginAction } from '../../src/server/auth.server'
import { chatAction, chatLoader, loadChatOpen, loadChatThread } from '../../src/server/chat.server'
import type { SupabaseServerClient } from '../../src/server/supabase.server'

const origin = 'https://circuitone-dev.magalz.space'
const ME = '02000000-0000-4000-8000-000000000001'
const MINE2 = '02000000-0000-4000-8000-000000000002'
const OTHER = '02000000-0000-4000-8000-000000000007'
const STRANGER = '02000000-0000-4000-8000-000000000009'
const C = '05000000-0000-4000-8000-000000000001'
const conv = (n: number) => `0d000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const msgId = (n: number) => `0e000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const REQ = '0b000000-0000-4000-8000-000000000001'

type Result = { data: unknown; error: unknown }
const ok = (data: unknown): Result => ({ data, error: null })
type Rpc = Result | ((args: Record<string, unknown>) => Result)

const label = (kind: string, id: string, name: string) => ({ kind, id, name })
const profileRow = (id: string, name: string) => ({ id, kind: 'member', name, city: 'Recife', state_code: 'PE', published: false, is_default: false })
const conversation = (n: number, a = label('profile', ME, 'Minha atuação'), b = label('profile', OTHER, 'Interlocutor'), extra = {}) => ({
  id: conv(n), updated_at: `2026-10-06T12:${String(59 - n).padStart(2, '0')}:00.000001+00:00`,
  side_a: a, side_b: b, blocked: false, archived: false, unread_count: 0, ...extra,
})
const message = (n: number) => ({
  id: msgId(n), body: `Mensagem ${n}`, created_at: `2026-10-06T10:${String(n % 60).padStart(2, '0')}:00.000${n % 10}01+00:00`,
  sender_kind: 'profile', sender_id: OTHER, sender_name: 'Interlocutor',
})
const detail = (n: number, extra = {}) => ({ conversation_id: conv(n), last_message: message(1), blocked_by: [], ...extra })

function fakeClient(rpcs: Record<string, Rpc>, tables: Record<string, Result> = {}) {
  const rpc = vi.fn(async (name: string, args: Record<string, unknown> = {}) => {
    const entry = rpcs[name]
    if (!entry) throw new Error(`rpc inesperado: ${name}`)
    return typeof entry === 'function' ? entry(args) : entry
  })
  const from = vi.fn((table: string) => {
    const result = tables[table]
    if (!result) throw new Error(`tabela inesperada: ${table}`)
    const builder: Record<string, unknown> = { maybeSingle: async () => result }
    for (const method of ['select', 'eq']) builder[method] = () => builder
    return builder
  })
  return { client: { rpc, from } as unknown as SupabaseServerClient, rpc }
}
const calls = (spy: ReturnType<typeof vi.fn>, name: string) => spy.mock.calls.filter(([n]) => n === name).map(([, args]) => args)
const failure = async (promise: Promise<unknown>) => {
  try {
    await promise
  } catch (error) {
    return error as { status: number; message: string }
  }
  throw new Error('deveria falhar')
}

describe('loadChatOpen', () => {
  const rpcs = (list: unknown[], extra: Record<string, Rpc> = {}): Record<string, Rpc> => ({
    list_my_profiles: ok([profileRow(ME, 'Minha atuação'), profileRow(MINE2, 'Outro projeto meu')]),
    list_my_collectives: ok([{ id: C, kind: 'collective', name: 'Organização 1', city: 'Recife', state_code: 'PE', state: 'approved', role_name: 'Produção', is_owner: false }]),
    get_collective_access: ok({ owner: false, role_id: 'r', permissions: ['read_messages', 'send_messages'] }),
    list_conversations: ok(list),
    get_conversation_details: ok([detail(1)]),
    get_recent_messages: ok([message(1), message(2)]),
    ...extra,
  })
  const tables = { profiles: ok({ id: OTHER, name: 'Interlocutor' }) }

  it('sem conversa ainda: devolve quem pode enviar e nenhuma conversa, sem ler mensagens', async () => {
    const { client, rpc } = fakeClient(rpcs([]), tables)
    const result = await loadChatOpen(client, `profile:${OTHER}`)
    expect(result.destinatario).toEqual({ kind: 'profile', id: OTHER, nome: 'Interlocutor' })
    expect(result.remetentes.map((r) => r.nome)).toEqual(['Minha atuação', 'Outro projeto meu', 'Organização 1'])
    expect(result.conversas).toEqual([])
    expect(result.inicial).toBeNull()
    expect(calls(rpc, 'get_recent_messages')).toEqual([])
  })

  it('acha a conversa entre uma das minhas pontas e o interlocutor (a mais recente primeiro) e carrega o histórico dela', async () => {
    const list = [
      conversation(3, label('profile', MINE2, 'Outro projeto meu'), label('profile', OTHER, 'Interlocutor'), { unread_count: 2 }),
      conversation(1),
      // Outra conversa minha com outra pessoa, e uma conversa alheia ao interlocutor: ficam de fora.
      conversation(2, label('profile', ME, 'Minha atuação'), label('profile', STRANGER, 'Outra pessoa')),
      conversation(4, label('profile', STRANGER, 'Outra pessoa'), label('profile', OTHER, 'Interlocutor')),
    ]
    const { client, rpc } = fakeClient(rpcs(list, { get_conversation_details: ok([detail(3)]) }), tables)
    const result = await loadChatOpen(client, `profile:${OTHER}`)
    expect(result.conversas.map((c) => [c.id, c.de.nome, c.naoLidas])).toEqual([[conv(3), 'Outro projeto meu', 2], [conv(1), 'Minha atuação', 0]])
    expect(result.inicial).toMatchObject({ conversationId: conv(3), bloqueada: false, maisAnteriores: false })
    expect(result.inicial?.mensagens.map((m) => m.texto)).toEqual(['Mensagem 1', 'Mensagem 2'])
    expect(calls(rpc, 'get_recent_messages')).toEqual([{ target: conv(3) }])
  })

  it('o coletivo remetente também encontra a conversa dele com o interlocutor', async () => {
    const list = [conversation(1, label('collective', C, 'Organização 1'), label('profile', OTHER, 'Interlocutor'), { blocked: true })]
    const { client } = fakeClient(rpcs(list, { get_conversation_details: ok([detail(1, { blocked_by: [label('profile', OTHER, 'Interlocutor')] })]) }), tables)
    const result = await loadChatOpen(client, `profile:${OTHER}`)
    expect(result.conversas).toEqual([{ id: conv(1), de: { kind: 'collective', id: C, nome: 'Organização 1' }, naoLidas: 0, bloqueada: true, arquivada: false }])
    expect(result.inicial?.bloqueada).toBe(true)
  })

  it('conversa de um coletivo em que não posso enviar não é oferecida', async () => {
    const list = [conversation(1, label('collective', C, 'Organização 1'), label('profile', OTHER, 'Interlocutor'))]
    const { client } = fakeClient(rpcs(list, { get_collective_access: ok({ owner: false, role_id: 'r', permissions: ['read_messages'] }) }), tables)
    expect((await loadChatOpen(client, `profile:${OTHER}`)).conversas).toEqual([])
  })

  it('interlocutor inválido ou invisível responde 404', async () => {
    for (const para of [null, '', 'profile:x', `user:${OTHER}`]) {
      expect(await failure(loadChatOpen(fakeClient(rpcs([]), tables).client, para))).toMatchObject({ status: 404, message: 'Interlocutor não encontrado.' })
    }
    expect(await failure(loadChatOpen(fakeClient(rpcs([]), { profiles: ok(null) }).client, `profile:${OTHER}`))).toMatchObject({ status: 404 })
  })

  it('banco indisponível vira 503, nunca "sem conversa"', async () => {
    const { client } = fakeClient(rpcs([], { list_conversations: { data: null, error: { message: 'boom' } } }), tables)
    expect(await failure(loadChatOpen(client, `profile:${OTHER}`))).toMatchObject({ status: 503 })
  })
})

describe('loadChatThread', () => {
  it('página mais recente, com a marca de "há anteriores" quando vêm 50', async () => {
    const full = Array.from({ length: 50 }, (_, i) => message(i + 1))
    const { client } = fakeClient({ get_conversation_details: ok([detail(1)]), get_recent_messages: ok(full) })
    const result = await loadChatThread(client, conv(1))
    expect(result.mensagens).toHaveLength(50)
    expect(result).toMatchObject({ maisAnteriores: true, bloqueada: false })
  })

  it('usa o cursor original (com microssegundos) para as anteriores', async () => {
    const { client, rpc } = fakeClient({ get_conversation_details: ok([detail(1)]), get_recent_messages: ok([message(1)]) })
    await loadChatThread(client, conv(1), { time: '2026-10-06T10:01:00.000101+00:00', id: msgId(5) })
    expect(calls(rpc, 'get_recent_messages')).toEqual([{ target: conv(1), before_time: '2026-10-06T10:01:00.000101+00:00', before_id: msgId(5) }])
  })

  it('bloqueio de qualquer lado aparece como bloqueada', async () => {
    const { client } = fakeClient({ get_conversation_details: ok([detail(1, { blocked_by: [label('profile', OTHER, 'Interlocutor')] })]), get_recent_messages: ok([message(1)]) })
    expect((await loadChatThread(client, conv(1))).bloqueada).toBe(true)
  })

  it('conversa que não é do titular (o banco devolve vazio), inexistente ou com id inválido: 404 igual', async () => {
    for (const id of [conv(9), 'qualquer-coisa']) {
      const { client } = fakeClient({ get_conversation_details: ok([]), get_recent_messages: ok([]) })
      expect(await failure(loadChatThread(client, id))).toMatchObject({ status: 404, message: 'Conversa não encontrada.' })
    }
  })

  it('erro do banco é 503', async () => {
    const { client } = fakeClient({ get_conversation_details: ok([detail(1)]), get_recent_messages: { data: null, error: { message: 'boom' } } })
    expect(await failure(loadChatThread(client, conv(1)))).toMatchObject({ status: 503 })
  })
})

// ---- Rotas de recurso (Request -> Response) ----

type Call = { method: string; path: string; body: string }
let seen: Call[]
let rpcAnswers: Record<string, (body: Record<string, unknown>) => Response>
let accountSession: { id: string; name: string; state: string; reason: null }
let tables: Record<string, unknown>
const token = (id: string) => ['eyJhbGciOiJIUzI1NiJ9', Buffer.from(JSON.stringify({ sub: id, exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'), id].join('.')
const answer = (data: unknown, status = 200) => () => Response.json(data, { status })
const dbError = (code: string, message: string, status = 400) => () => Response.json({ code, message, details: null, hint: null }, { status })

beforeEach(() => {
  seen = []
  rpcAnswers = {}
  tables = { profiles: { id: OTHER, name: 'Interlocutor' } }
  accountSession = { id: 'A', name: 'Pessoa A sintética', state: 'active', reason: null }
  vi.stubEnv('CIRCUITONE_RUNTIME', 'development')
  vi.stubEnv('APP_ORIGIN', origin)
  vi.stubEnv('SUPABASE_URL', 'https://odphoxozclrshqjgwbqk.supabase.co')
  vi.stubEnv('SUPABASE_PUBLISHABLE_KEY', 'sb_publishable_synthetic')
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string | Request | URL, init?: RequestInit) => {
      const u = new URL(String(url))
      seen.push({ method: init?.method ?? 'GET', path: u.pathname, body: String(init?.body ?? '') })
      if (u.pathname === '/auth/v1/token')
        return Response.json({ access_token: token('A'), refresh_token: 'refresh-A', expires_in: 3600, token_type: 'bearer', user: { id: 'A', email: 'a@example.invalid' } })
      if (u.pathname === '/auth/v1/user') return Response.json({ id: 'A', email: 'a@example.invalid' })
      if (u.pathname === '/rest/v1/rpc/get_account_session') return Response.json(accountSession)
      const rpc = /^\/rest\/v1\/rpc\/(.+)$/.exec(u.pathname)?.[1]
      if (rpc) {
        const handler = rpcAnswers[rpc]
        if (!handler) throw new Error('RPC inesperado: ' + rpc)
        return handler(init?.body ? JSON.parse(String(init.body)) : {})
      }
      const table = /^\/rest\/v1\/([a-z_]+)$/.exec(u.pathname)?.[1]
      if (table && table in tables) return Response.json(tables[table], { headers: { 'content-type': 'application/vnd.pgrst.object+json' } })
      throw new Error('HTTP inesperado: ' + u.pathname)
    }),
  )
})
afterEach(() => vi.unstubAllEnvs())

const rpcNames = () => seen.filter((c) => c.path.startsWith('/rest/v1/rpc/') && !c.path.endsWith('get_account_session')).map((c) => c.path.split('/').pop())
const signIn = async () => {
  const response = await loginAction(new Request(origin + '/entrar', { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ email: 'a@example.invalid', password: 'x' }) }))
  seen = []
  return response.headers.getSetCookie().map((value) => value.split(';')[0]).join('; ')
}
const get = (path: string, headers: Record<string, string> = {}) => new Request(origin + path, { headers })
const post = (path: string, fields: Record<string, string>, headers: Record<string, string> = {}, body?: BodyInit) =>
  new Request(origin + path, { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/x-www-form-urlencoded', ...headers }, body: body ?? new URLSearchParams(fields) })

describe('chatLoader (GET /api/chat/abrir e /conversa)', () => {
  const openRpcs = () => {
    rpcAnswers.list_my_profiles = answer([profileRow(ME, 'Minha atuação')])
    rpcAnswers.list_my_collectives = answer([])
    rpcAnswers.list_conversations = answer([conversation(1)])
    rpcAnswers.get_conversation_details = answer([detail(1)])
    rpcAnswers.get_recent_messages = answer([message(1)])
  }

  it('abre a janela: JSON privado, sem cache, com a conversa e as mensagens', async () => {
    openRpcs()
    const response = await chatLoader(get(`/api/chat/abrir?para=profile:${OTHER}`, { Cookie: await signIn() }), 'abrir')
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toContain('application/json')
    expect(response.headers.get('cache-control')).toContain('no-store')
    const body = await response.json()
    expect(body.destinatario).toMatchObject({ id: OTHER, nome: 'Interlocutor' })
    expect(body.conversas).toHaveLength(1)
    expect(body.inicial.mensagens.map((m: { texto: string }) => m.texto)).toEqual(['Mensagem 1'])
  })

  it('lê a conversa para a atualização periódica e as anteriores por cursor', async () => {
    openRpcs()
    const cookie = await signIn()
    const poll = await chatLoader(get(`/api/chat/conversa?id=${conv(1)}`, { Cookie: cookie }), 'conversa')
    expect(poll.status).toBe(200)
    expect(await poll.json()).toMatchObject({ bloqueada: false, maisAnteriores: false })
    const older = await chatLoader(get(`/api/chat/conversa?id=${conv(1)}&antes_t=${encodeURIComponent('2026-10-06T10:01:00.000101+00:00')}&antes_id=${msgId(5)}`, { Cookie: cookie }), 'conversa')
    expect(older.status).toBe(200)
    const sent = seen.filter((c) => c.path.endsWith('get_recent_messages')).map((c) => JSON.parse(c.body))
    expect(sent[1]).toEqual({ target: conv(1), before_time: '2026-10-06T10:01:00.000101+00:00', before_id: msgId(5) })
  })

  it('cursor malformado responde 404 sem consultar mensagens', async () => {
    openRpcs()
    const cookie = await signIn()
    for (const query of ['antes_t=x&antes_id=y', `antes_t=2026-10-06T10:00:00Z`, `antes_id=${msgId(1)}`]) {
      const response = await chatLoader(get(`/api/chat/conversa?id=${conv(1)}&${query}`, { Cookie: cookie }), 'conversa')
      expect(response.status, query).toBe(404)
    }
    expect(rpcNames()).not.toContain('get_recent_messages')
  })

  it('sem sessão: 401, sem tocar em nenhuma tabela ou RPC', async () => {
    const response = await chatLoader(get(`/api/chat/abrir?para=profile:${OTHER}`), 'abrir')
    expect(response.status).toBe(401)
    expect((await response.json()).error).toMatch(/Entre novamente/)
    expect(rpcNames()).toEqual([])
    expect(seen.some((c) => c.path.startsWith('/rest/v1/profiles'))).toBe(false)
  })

  it('conta que não está ativa (suspensa, em exclusão, incompleta): 403', async () => {
    openRpcs()
    for (const state of ['suspended', 'deletion_pending', 'incomplete']) {
      accountSession = { ...accountSession, state }
      const response = await chatLoader(get(`/api/chat/abrir?para=profile:${OTHER}`, { Cookie: await signIn() }), 'abrir')
      expect(response.status, state).toBe(403)
    }
    expect(rpcNames()).toEqual([])
  })

  it('pedido de outro site, método errado e rota desconhecida são recusados antes de qualquer acesso', async () => {
    openRpcs()
    const cookie = await signIn()
    expect((await chatLoader(get(`/api/chat/abrir?para=profile:${OTHER}`, { Cookie: cookie, 'Sec-Fetch-Site': 'cross-site' }), 'abrir')).status).toBe(403)
    expect((await chatLoader(new Request(origin + '/api/chat/abrir', { method: 'DELETE', headers: { Cookie: cookie } }), 'abrir')).status).toBe(405)
    expect((await chatLoader(get('/api/chat/enviar', { Cookie: cookie }), 'enviar')).status).toBe(404)
    expect((await chatLoader(get('/api/chat/x', { Cookie: cookie }), undefined)).status).toBe(404)
    expect(seen).toEqual([])
  })

  it('interlocutor ou conversa que o titular não enxerga: 404; banco indisponível: 503 sem texto do banco', async () => {
    openRpcs()
    const cookie = await signIn()
    tables.profiles = null
    expect((await chatLoader(get(`/api/chat/abrir?para=profile:${OTHER}`, { Cookie: cookie }), 'abrir')).status).toBe(404)
    rpcAnswers.get_conversation_details = answer([])
    const hidden = await chatLoader(get(`/api/chat/conversa?id=${conv(1)}`, { Cookie: cookie }), 'conversa')
    expect(hidden.status).toBe(404)
    expect((await hidden.json()).error).toBe('Conversa não encontrada.')
    rpcAnswers.get_conversation_details = dbError('XX000', 'relation "private.messages" is broken', 500)
    const broken = await chatLoader(get(`/api/chat/conversa?id=${conv(1)}`, { Cookie: cookie }), 'conversa')
    expect(broken.status).toBe(503)
    expect(JSON.stringify(await broken.json())).not.toContain('private.messages')
  })
})

describe('chatAction (POST /api/chat/enviar e /lida)', () => {
  const via = `profile:${ME}>profile:${OTHER}`
  const path = '/api/chat/enviar'
  const run = async (fields: Record<string, string>, headers: Record<string, string> = {}, route: string | undefined = 'enviar', p = path) => {
    const response = await chatAction(post(p, fields, headers), route)
    return { response, body: await response.json() }
  }

  it('envia pelo RPC e devolve a conversa (JSON, privado); o sucesso só existe depois do RPC', async () => {
    rpcAnswers.send_message = answer({ conversation_id: conv(7), message_id: msgId(1) })
    const { response, body } = await run({ via, request_id: REQ, body: '  Olá\r\nmundo ' })
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toContain('application/json')
    expect(response.headers.get('cache-control')).toContain('no-store')
    // O id da mensagem real deixa a tela trocar a mensagem em envio pela confirmada.
    expect(body).toEqual({ ok: true, message: 'Mensagem enviada.', conversation_id: conv(7), message_id: msgId(1) })
    expect(JSON.parse(seen.find((c) => c.path.endsWith('send_message'))!.body)).toEqual({
      sender_kind: 'profile', sender: ME, recipient_kind: 'profile', recipient: OTHER, body: 'Olá\nmundo', request_id: REQ,
    })
  })

  it('o mesmo request_id devolve a mesma conversa (idempotência fica no banco) e nenhum RPC é pulado', async () => {
    rpcAnswers.send_message = answer({ conversation_id: conv(7), message_id: msgId(1) })
    const first = await run({ via, request_id: REQ, body: 'oi' })
    const second = await run({ via, request_id: REQ, body: 'oi' })
    expect(second.body).toEqual(first.body)
    const sends = seen.filter((c) => c.path.endsWith('send_message')).map((c) => JSON.parse(c.body).request_id)
    expect(sends).toEqual([REQ, REQ])
  })

  it.each([
    ['Conversa bloqueada', '42501', 409, 'Esta conversa está bloqueada: ninguém pode enviar mensagens enquanto o bloqueio durar.'],
    ['Envio não autorizado', '42501', 403, 'Você não pode enviar mensagens por esta atuação ou coletivo, ou o interlocutor não está mais disponível.'],
    ['Conta confirmada necessária', '42501', 403, 'Confirme sua conta para enviar mensagens.'],
    ['Limite de mensagens por minuto', '54000', 429, 'Muitas mensagens em pouco tempo. Aguarde um minuto e tente de novo.'],
  ])('erro do banco "%s" chega traduzido, com o status certo e nunca como sucesso', async (message, code, status, error) => {
    rpcAnswers.send_message = dbError(code, message)
    const { response, body } = await run({ via, body: 'a' })
    expect(response.status).toBe(status)
    expect(body).toEqual({ ok: false, error })
  })

  it('sessão vencida (401 do banco) pede para entrar de novo; texto desconhecido do banco não vaza', async () => {
    rpcAnswers.send_message = dbError('PGRST301', 'JWT expired', 401)
    expect((await run({ via, body: 'a' })).body).toEqual({ ok: false, error: 'Sua sessão expirou. Entre novamente para continuar.' })
    rpcAnswers.send_message = dbError('XX000', 'relation "private.messages" is broken', 500)
    const broken = await run({ via, body: 'a' })
    expect(broken.response.status).toBe(503)
    expect(JSON.stringify(broken.body)).not.toContain('private.messages')
  })

  it('resposta do RPC sem a conversa não é sucesso', async () => {
    rpcAnswers.send_message = answer({})
    expect((await run({ via, body: 'a' })).response.status).toBe(503)
  })

  it('texto vazio, longo demais e remetente inválido não chegam ao banco', async () => {
    expect((await run({ via, body: '   ' })).response.status).toBe(422)
    expect((await run({ via, body: 'x'.repeat(2001) })).response.status).toBe(422)
    expect((await run({ via: 'profile:x>profile:y', body: 'a' })).response.status).toBe(400)
    expect((await run({ body: 'a' })).response.status).toBe(400)
    expect(seen).toEqual([])
  })

  it('origem externa, método errado, caminho errado, rota desconhecida e corpo grande: recusados com JSON', async () => {
    expect((await run({ via, body: 'a' }, { Origin: 'https://attacker.invalid' })).response.status).toBe(403)
    expect((await run({ via, body: 'a' }, { 'Sec-Fetch-Site': 'cross-site' })).response.status).toBe(403)
    expect((await run({ via, body: 'a' }, {}, 'enviar', '/api/chat/lida')).response.status).toBe(405)
    expect((await run({ via, body: 'a' }, {}, 'outra')).response.status).toBe(404)
    const get405 = await chatAction(new Request(origin + path, { headers: { Origin: origin } }), 'enviar')
    expect(get405.status).toBe(405)
    const big = await chatAction(post(path, {}, {}, new URLSearchParams({ via, body: 'x'.repeat(40_000) })), 'enviar')
    expect(big.status).toBe(413)
    expect(seen).toEqual([])
  })

  it('o sufixo .data do single fetch não é uma rota do chat', async () => {
    expect((await run({ via, body: 'a' }, {}, 'enviar.data', '/api/chat/enviar.data')).response.status).toBe(404)
  })

  it('marca como lida pelo RPC, com a conversa e a última mensagem', async () => {
    rpcAnswers.mark_conversation_read = () => new Response(null, { status: 204 })
    const { response, body } = await run({ conversation: conv(7), last: msgId(3) }, {}, 'lida', '/api/chat/lida')
    expect(response.status).toBe(200)
    expect(body.ok).toBe(true)
    expect(JSON.parse(seen.find((c) => c.path.endsWith('mark_conversation_read'))!.body)).toEqual({ target: conv(7), last_message: msgId(3) })
    expect((await run({ conversation: 'x', last: msgId(3) }, {}, 'lida', '/api/chat/lida')).response.status).toBe(400)
    rpcAnswers.mark_conversation_read = dbError('42501', 'Leitura não autorizada')
    expect((await run({ conversation: conv(7), last: msgId(3) }, {}, 'lida', '/api/chat/lida')).response.status).toBe(403)
  })
})
