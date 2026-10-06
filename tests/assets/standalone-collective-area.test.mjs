import assert from 'node:assert/strict'
import { test } from 'node:test'

// Área do coletivo (W7) no servidor SSR real (build de produção) com um Supabase simulado: códigos HTTP, precedência do
// redirecionamento de visitante, estados bloqueados, ações por single fetch (`.data`) e por POST de documento.
const origin = 'https://circuitone-dev.magalz.space'
const uid = '81000000-0000-4000-8000-000000000002'
const C = '05000000-0000-4000-8000-000000000001'
const PENDING = '05000000-0000-4000-8000-000000000002'
const OTHER = '05000000-0000-4000-8000-000000000009'
const R = '09000000-0000-4000-8000-000000000001'
const jwt = [
  'eyJhbGciOiJIUzI1NiJ9',
  Buffer.from(JSON.stringify({ sub: uid, exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'),
  'synthetic',
].join('.')

/** Rótulos dos links do menu do coletivo (o menu do painel também tem "Mensagens", por exemplo). */
const sectionLabels = (html) => {
  const nav = /<nav aria-label="Seções do coletivo"[^>]*>(.*?)<\/nav>/s.exec(html)?.[1] ?? ''
  return [...nav.matchAll(/<a [^>]*>(.*?)<\/a>/gs)].map((match) => match[1].replace(/<!-- -->/g, ''))
}

const mine = (id, extra = {}) => ({
  id, kind: 'collective', name: `Coletivo ${id.slice(-1)}`, city: 'Recife', state_code: 'PE', state: 'approved', role_name: 'Membro', is_owner: false, ...extra,
})

test('área do coletivo: 404 sem vínculo, estado bloqueado, permissões, redirecionamento de visitante e ações', async () => {
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

  const state = {
    collectives: [mine(C, { is_owner: false }), mine(PENDING, { state: 'pending', is_owner: true })],
    permissions: [],
    queue: [{
      id: R, created_at: '2026-10-07T12:00:00+00:00', message: 'Quero entrar', requester_name: 'Pessoa que pede',
      profile_id: null, profile_name: null, profile_kind: null, profile_published: null,
    }],
    decide: { status: 204, body: null },
    sent: [],
  }
  const rpc = {
    get_account_session: () => ({ id: uid, name: 'Identidade SSR sintética', state: 'active', reason: null }),
    list_my_profiles: () => [],
    list_my_collectives: () => state.collectives,
    list_conversations: () => [],
    get_collective_access: (args) =>
      args.target === C ? { owner: false, role_id: 'r', permissions: state.permissions } : null,
    get_collective_status: () => ({ id: PENDING, state: 'pending', reason: null }),
    list_collective_requests: () => state.queue,
    list_collective_events: () => [],
    get_my_collective_requests: () => [],
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
      if (name === 'decide_collective_request') {
        state.sent.push({ name, args })
        return state.decide.body ? Response.json(state.decide.body, { status: state.decide.status }) : new Response(null, { status: state.decide.status })
      }
      if (['request_collective_membership', 'cancel_collective_request'].includes(name)) {
        state.sent.push({ name, args })
        return name === 'request_collective_membership' ? Response.json(R) : new Response(null, { status: 204 })
      }
      if (!rpc[name]) throw new Error(`Unexpected rpc ${name}`)
      return Response.json(rpc[name](args))
    }
    if (u.pathname === '/rest/v1/collectives') {
      if (u.searchParams.get('id')) return Response.json([{ id: C, color: '#8b5cf6' }])
      return Response.json([])
    }
    if (u.pathname === '/rest/v1/events') return Response.json([])
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

    // Membro sem permissões: painel básico, respostas privadas, nenhum item de menu delegável.
    let response = await get(`/coletivo/${C}/painel`)
    assert.equal(response.status, 200)
    assert.match(response.headers.get('cache-control'), /no-store/)
    let html = await response.text()
    assert.deepEqual(sectionLabels(html), ['Dashboard'])
    assert.match(html, /Seu perfil não gere eventos/)

    // Com "gerir pedidos de entrada" o menu mostra a quantidade pendente.
    state.permissions = ['manage_requests']
    response = await get(`/coletivo/${C}/painel`)
    assert.equal(response.status, 200)
    assert.deepEqual(sectionLabels(await response.text()), ['Dashboard', 'Solicitações (1)'])

    // A rota de dados (single fetch) responde igual.
    response = await get(`/coletivo/${C}/painel.data`)
    assert.equal(response.status, 200)
    assert.match(response.headers.get('cache-control'), /no-store/)

    // Sem vínculo: 404 que não revela se o coletivo existe; id que não é UUID também.
    for (const id of [OTHER, 'col-litoral']) {
      response = await get(`/coletivo/${id}/painel`)
      assert.equal(response.status, 404, id)
      assert.match(await response.text(), /Coletivo não encontrado\./)
    }

    // Visitante: o redirecionamento do layout autenticado vence o erro do layout do coletivo.
    for (const path of [`/coletivo/${C}/painel`, `/coletivo/${C}/solicitacoes`, '/painel/coletivos']) {
      response = await get(path, '')
      assert.equal(response.status, 302, path)
      assert.equal(response.headers.get('location'), '/entrar')
    }

    // Coletivo em análise: só o estado, sem menu nem função interna.
    for (const path of ['painel', 'solicitacoes']) {
      response = await get(`/coletivo/${PENDING}/${path}`)
      html = await response.text()
      assert.match(html, /em análise/)
      assert.match(html, /somente depois da aprovação/)
      assert.doesNotMatch(html, /Seções do coletivo|solicitações pendentes/)
    }

    // Fila de pedidos: com a permissão, a lista; sem ela, 403 com a explicação dentro do layout.
    response = await get(`/coletivo/${C}/solicitacoes`)
    assert.equal(response.status, 200)
    html = await response.text()
    assert.match(html, /Pessoa que pede/)
    assert.match(html, /Quero entrar/)
    state.permissions = []
    response = await get(`/coletivo/${C}/solicitacoes`)
    assert.equal(response.status, 403)
    html = await response.text()
    assert.match(html, /não tem permissão para gerir pedidos de entrada/)
    assert.deepEqual(sectionLabels(html), ['Dashboard'])
    assert.doesNotMatch(html, /Pessoa que pede/)
    state.permissions = ['manage_requests']

    // Decisão por single fetch (form já hidratado): o RPC recebe a decisão e a resposta traz o sucesso, privada.
    response = await post(`/coletivo/${C}/solicitacoes.data`, { intent: 'approve', request: R })
    assert.equal(response.status, 200)
    assert.match(response.headers.get('cache-control'), /no-store/)
    assert.match(await response.text(), /Pedido aprovado\./)
    assert.deepEqual(state.sent.pop(), { name: 'decide_collective_request', args: { target_request: R, approve: true } })

    // Erro do banco vira mensagem traduzida, nunca sucesso.
    state.decide = { status: 400, body: { code: '22023', message: 'Pedido já decidido ou decisão inválida' } }
    response = await post(`/coletivo/${C}/solicitacoes.data`, { intent: 'decline', request: R })
    const failed = await response.text()
    assert.match(failed, /Este pedido já foi decidido\./)
    assert.doesNotMatch(failed, /Pedido recusado\./)
    state.decide = { status: 204, body: null }
    state.sent.length = 0

    // POST de documento (sem JavaScript): a página volta renderizada com o resultado.
    response = await post(`/coletivo/${C}/solicitacoes`, { intent: 'decline', request: R })
    assert.match(await response.text(), /Pedido recusado\./)
    assert.deepEqual(state.sent.pop(), { name: 'decide_collective_request', args: { target_request: R, approve: false } })

    // Origem externa recusada antes de qualquer RPC (o próprio React Router já rejeita Origin diferente do Host).
    // A conferência com APP_ORIGIN da ação cobre o que passar por ele e está em collective-area-actions.test.ts.
    response = await post(`/coletivo/${C}/solicitacoes.data`, { intent: 'approve', request: R }, { Origin: 'https://evil.example.invalid' }).then(
      (reply) => reply,
      (error) => ({ status: 400, error }),
    )
    assert.equal(response.status, 400)
    assert.deepEqual(state.sent, [])

    // Meus coletivos: pedir entrada e cancelar passam pelos RPCs corretos.
    response = await get('/painel/coletivos')
    assert.equal(response.status, 200)
    assert.match(await response.text(), /solicitar acesso/)
    response = await post('/painel/coletivos.data', { intent: 'request', collective: OTHER, profile: '', message: 'Olá' })
    assert.match(await response.text(), /Pedido enviado\./)
    assert.deepEqual(state.sent.pop(), { name: 'request_collective_membership', args: { target: OTHER, message: 'Olá' } })
    response = await post('/painel/coletivos.data', { intent: 'cancel', request: R })
    assert.match(await response.text(), /Pedido cancelado\./)
    assert.deepEqual(state.sent.pop(), { name: 'cancel_collective_request', args: { target_request: R } })
  } finally {
    globalThis.fetch = originalFetch
    for (const key of Object.keys(process.env)) if (!(key in saved)) delete process.env[key]
    Object.assign(process.env, saved)
  }
})
