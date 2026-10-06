import assert from 'node:assert/strict'
import { test } from 'node:test'

// Mensagens (W10) no servidor SSR real (build de produção) com um Supabase simulado: roteamento de `nova` e
// `:conversationId?`, redirecionamento de visitante, 403/404, ações por single fetch (`.data`) e por POST de documento.
const origin = 'https://circuitone-dev.magalz.space'
const uid = '81000000-0000-4000-8000-000000000003'
const ME = '02000000-0000-4000-8000-000000000001'
const OTHER = '02000000-0000-4000-8000-000000000007'
const C = '05000000-0000-4000-8000-000000000001'
const CONV = '0d000000-0000-4000-8000-000000000001'
const NEW_CONV = '0d000000-0000-4000-8000-000000000009'
const MSG = '0e000000-0000-4000-8000-000000000001'
const jwt = [
  'eyJhbGciOiJIUzI1NiJ9',
  Buffer.from(JSON.stringify({ sub: uid, exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'),
  'synthetic',
].join('.')

const label = (kind, id, name) => ({ kind, id, name })

test('mensagens: rotas, 403/404, visitante, envio por single fetch e criação de conversa com redirecionamento', async () => {
  const { createRequestHandler } = await import('react-router')
  const build = await import('../../build/server/index.js')
  const handler = createRequestHandler(build, 'production')
  const saved = { ...process.env }
  const originalFetch = globalThis.fetch
  Object.assign(process.env, {
    CIRCUITONE_RUNTIME: 'development',
    APP_ORIGIN: origin,
    SUPABASE_URL: 'https://odphoxozclrshqjgwbqk.supabase.co',
    SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_synthetic',
  })

  const state = { permissions: ['read_messages'], sent: [], sendFailure: null }
  const conversation = {
    id: CONV, updated_at: '2026-10-06T12:00:00.123456+00:00', side_a: label('profile', ME, 'Minha atuação'),
    side_b: label('profile', OTHER, 'Interlocutor'), blocked: false, archived: false, unread_count: 1,
  }
  const rpc = {
    get_account_session: () => ({ id: uid, name: 'Identidade SSR sintética', state: 'active', reason: null }),
    list_my_profiles: () => [{ id: ME, kind: 'member', name: 'Minha atuação', city: 'Recife', state_code: 'PE', published: false, is_default: false }],
    list_my_collectives: () => [{ id: C, kind: 'collective', name: 'Coletivo 1', city: 'Recife', state_code: 'PE', state: 'approved', role_name: 'Membro', is_owner: false }],
    list_conversations: () => [conversation],
    get_conversation_details: () => [{
      conversation_id: CONV, blocked_by: [],
      last_message: { id: MSG, body: 'Olá <b>mundo</b>', created_at: '2026-10-06T12:00:00+00:00', sender_kind: 'profile', sender_id: OTHER, sender_name: 'Interlocutor' },
    }],
    get_recent_messages: () => [{ id: MSG, body: 'Olá <b>mundo</b>', created_at: '2026-10-06T12:00:00+00:00', sender_kind: 'profile', sender_id: OTHER, sender_name: 'Interlocutor' }],
    get_collective_access: () => ({ owner: false, role_id: 'r', permissions: state.permissions }),
  }
  globalThis.fetch = async (url, init) => {
    const u = new URL(url)
    const authorized = new Headers(init?.headers).get('authorization')?.endsWith('.synthetic') === true
    if (u.pathname === '/auth/v1/token')
      return Response.json({ access_token: jwt, refresh_token: 'synthetic-refresh', expires_in: 3600, token_type: 'bearer', user: { id: uid, email: 'ssr@example.invalid' } })
    if (u.pathname === '/auth/v1/user') return Response.json({ id: uid, email: 'ssr@example.invalid' })
    if (u.pathname.startsWith('/rest/v1/rpc/')) {
      const name = u.pathname.replace('/rest/v1/rpc/', '')
      const args = init?.body ? JSON.parse(String(init.body)) : {}
      if (!authorized) return Response.json({ code: '42501', message: `permission denied for function ${name}` }, { status: 401 })
      if (['send_message', 'mark_conversation_read', 'set_conversation_block', 'report_message'].includes(name)) {
        state.sent.push({ name, args })
        if (name === 'send_message')
          return state.sendFailure ? Response.json(state.sendFailure, { status: 403 }) : Response.json({ conversation_id: NEW_CONV, message_id: MSG })
        return new Response(null, { status: 204 })
      }
      if (!rpc[name]) throw new Error(`Unexpected rpc ${name}`)
      return Response.json(rpc[name](args))
    }
    if (u.pathname === '/rest/v1/collectives') return Response.json(u.searchParams.get('id') ? [{ id: C, color: '#8b5cf6' }] : [])
    if (u.pathname === '/rest/v1/profiles') return Response.json({ id: OTHER, name: 'Artista público' })
    if (u.pathname === '/auth/v1/logout') return new Response(null, { status: 204 })
    throw new Error(`Unexpected SSR provider request ${u.pathname}`)
  }

  try {
    const login = await handler(
      new Request(origin + '/entrar', {
        method: 'POST',
        headers: { Origin: origin, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'email=ssr%40example.invalid&password=synthetic-only-password',
      }),
    )
    assert.equal(login.status, 303)
    const Cookie = login.headers.getSetCookie().map((value) => value.split(';')[0]).join('; ')
    const get = (path, cookie = Cookie) => handler(new Request(origin + path, { headers: cookie ? { Cookie: cookie } : {} }))
    const post = (path, fields, headers = {}) =>
      handler(new Request(origin + path, {
        method: 'POST',
        headers: { Origin: origin, Cookie, 'Content-Type': 'application/x-www-form-urlencoded', ...headers },
        body: new URLSearchParams(fields),
      }))

    // Lista e conversa aberta (link direto): respostas privadas; o corpo é texto escapado, nunca HTML.
    let response = await get('/painel/mensagens')
    assert.equal(response.status, 200)
    assert.match(response.headers.get('cache-control'), /no-store/)
    let html = await response.text()
    assert.match(html, /central_de_mensagens/)
    assert.match(html, /Olá &lt;b&gt;mundo&lt;\/b&gt;/)
    response = await get(`/painel/mensagens/${CONV}`)
    assert.equal(response.status, 200)
    html = await response.text()
    assert.match(html, /role="log"/)
    assert.doesNotMatch(html, /<b>mundo<\/b>/)
    response = await get(`/painel/mensagens/${CONV}.data`)
    assert.equal(response.status, 200)

    // Conversa que o titular não lê, ou que não é UUID: 404 igual. Visitante vai para /entrar.
    for (const id of ['0d000000-0000-4000-8000-0000000000ff', 'qualquer-coisa']) {
      response = await get(`/painel/mensagens/${id}`)
      assert.equal(response.status, 404, id)
      assert.match(await response.text(), /Conversa não encontrada\./)
    }
    for (const path of ['/painel/mensagens', `/painel/mensagens/${CONV}`, '/painel/mensagens/nova', `/coletivo/${C}/mensagens`]) {
      response = await get(path, '')
      assert.equal(response.status, 302, path)
      assert.equal(response.headers.get('location'), '/entrar')
    }

    // Marcar como lida e enviar por single fetch (formulário já hidratado).
    response = await post(`/painel/mensagens/${CONV}.data`, { intent: 'read', last: MSG })
    assert.equal(response.status, 200)
    assert.deepEqual(state.sent.pop(), { name: 'mark_conversation_read', args: { target: CONV, last_message: MSG } })
    response = await post(`/painel/mensagens/${CONV}.data`, { intent: 'send', via: `profile:${ME}>profile:${OTHER}`, body: 'Resposta', request_id: '0b000000-0000-4000-8000-000000000001' })
    assert.match(await response.text(), /Mensagem enviada\./)
    assert.deepEqual(state.sent.pop(), {
      name: 'send_message',
      args: { sender_kind: 'profile', sender: ME, recipient_kind: 'profile', recipient: OTHER, body: 'Resposta', request_id: '0b000000-0000-4000-8000-000000000001' },
    })
    state.sendFailure = { code: '42501', message: 'Conversa bloqueada' }
    response = await post(`/painel/mensagens/${CONV}.data`, { intent: 'send', via: `profile:${ME}>profile:${OTHER}`, body: 'Resposta' })
    const refused = await response.text()
    assert.match(refused, /Esta conversa está bloqueada/)
    assert.doesNotMatch(refused, /Mensagem enviada\./)
    state.sendFailure = null
    state.sent.length = 0

    // Nova conversa: a rota estática vence `:conversationId?`; o envio redireciona para a conversa criada.
    response = await get(`/painel/mensagens/nova?para=profile:${OTHER}`)
    assert.equal(response.status, 200)
    html = await response.text()
    assert.match(html, /nova_mensagem/)
    assert.match(html, /Artista público/)
    response = await get('/painel/mensagens/nova?para=profile:x')
    assert.equal(response.status, 404)
    response = await post('/painel/mensagens/nova', { via: `profile:${ME}>profile:${OTHER}`, body: 'Primeira' })
    assert.equal(response.status, 302)
    assert.equal(response.headers.get('location'), `/painel/mensagens/${NEW_CONV}`)
    assert.match(response.headers.get('cache-control'), /no-store/)
    state.sent.length = 0

    // Coletivo: sem "ler mensagens" é 403 dentro do layout; com ela, a conversa do coletivo aparece.
    response = await get(`/coletivo/${C}/mensagens`)
    assert.equal(response.status, 200)
    state.permissions = ['send_messages']
    response = await get(`/coletivo/${C}/mensagens`)
    assert.equal(response.status, 403)
    html = await response.text()
    assert.match(html, /não tem permissão para ler as mensagens deste coletivo/)
    response = await get(`/coletivo/${C}/mensagens/${CONV}`)
    assert.equal(response.status, 403)
    state.permissions = ['read_messages']
    response = await post(`/painel/mensagens/${CONV}.data`, { intent: 'read', last: MSG }, { Origin: origin })
    assert.equal(response.status, 200)
    state.sent.length = 0
  } finally {
    globalThis.fetch = originalFetch
    for (const key of Object.keys(process.env)) if (!(key in saved)) delete process.env[key]
    Object.assign(process.env, saved)
  }
})
