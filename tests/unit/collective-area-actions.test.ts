// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { collectiveRequestsAction, myCollectivesAction } from '../../src/server/collective-area.server'
import { rpcFailure } from '../../src/server/mutation.server'
import { supabaseRouteHeaders } from '../../src/server/supabase.server'

const origin = 'https://circuitone-dev.magalz.space'
const C = '05000000-0000-4000-8000-000000000006'
const R = '09000000-0000-4000-8000-000000000001'
const P = '02000000-0000-4000-8000-000000000009'

type Sent = { name: string; body: Record<string, unknown> }
let sent: Sent[]
let reply: (name: string) => Response

beforeEach(() => {
  sent = []
  reply = () => new Response(null, { status: 204 })
  vi.stubEnv('CIRCUITONE_RUNTIME', 'development')
  vi.stubEnv('APP_ORIGIN', origin)
  vi.stubEnv('SUPABASE_URL', 'https://odphoxozclrshqjgwbqk.supabase.co')
  vi.stubEnv('SUPABASE_PUBLISHABLE_KEY', 'sb_publishable_synthetic')
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string | Request | URL, init?: RequestInit) => {
      const path = new URL(String(url)).pathname
      if (!path.startsWith('/rest/v1/rpc/')) throw new Error(`HTTP inesperado: ${path}`)
      const name = path.replace('/rest/v1/rpc/', '')
      sent.push({ name, body: init?.body ? JSON.parse(String(init.body)) : {} })
      return reply(name)
    }),
  )
})
afterEach(() => vi.unstubAllEnvs())

const dbError = (status: number, code: string, message: string) => () => Response.json({ code, message, details: null, hint: null }, { status })

const post = (path: string, fields: Record<string, string>, init: { headers?: Record<string, string>; method?: string; body?: BodyInit } = {}) =>
  new Request(origin + path, {
    method: init.method ?? 'POST',
    headers: { Origin: origin, 'Content-Type': 'application/x-www-form-urlencoded', ...init.headers },
    body: init.body ?? new URLSearchParams(fields),
  })

/** Lê o resultado de `data()` sem depender dos detalhes do React Router. */
const outcome = async (promise: Promise<unknown>) => {
  const result = (await promise) as { data: { ok: boolean; message?: string; error?: string }; init: { status: number; headers: Headers } }
  return { ...result.data, status: result.init.status, headers: result.init.headers }
}

describe('collectiveRequestsAction', () => {
  const path = `/coletivo/${C}/solicitacoes`
  const decide = (fields: Record<string, string>, init = {}) => outcome(collectiveRequestsAction(post(path, fields, init), C))

  it('aprova o pedido pelo RPC e só então informa o sucesso, com respostas privadas', async () => {
    const result = await decide({ intent: 'approve', request: R })
    expect(sent).toEqual([{ name: 'decide_collective_request', body: { target_request: R, approve: true } }])
    expect(result).toMatchObject({ ok: true, status: 200, message: 'Pedido aprovado. A pessoa agora faz parte do coletivo com o perfil Membro.' })
    expect(result.headers.get('cache-control')).toContain('no-store')
    expect(result.headers.get('vary')).toBe('Cookie')
  })

  it('recusa o pedido', async () => {
    expect(await decide({ intent: 'decline', request: R })).toMatchObject({ ok: true, message: 'Pedido recusado.' })
    expect(sent[0].body).toEqual({ target_request: R, approve: false })
  })

  it('normaliza o sufixo .data do single fetch, usado pelos envios depois da hidratação', async () => {
    const request = post(`${path}.data`, { intent: 'approve', request: R })
    expect(await outcome(collectiveRequestsAction(request, C))).toMatchObject({ ok: true })
  })

  it('falha do banco aparece como erro traduzido e nunca como sucesso', async () => {
    reply = dbError(400, '22023', 'Pedido já decidido ou decisão inválida')
    expect(await decide({ intent: 'approve', request: R })).toEqual(
      expect.objectContaining({ ok: false, status: 409, error: 'Este pedido já foi decidido.' }),
    )
    reply = dbError(403, '42501', 'Operação não autorizada')
    expect(await decide({ intent: 'approve', request: R })).toMatchObject({ ok: false, status: 403, error: 'Você não tem permissão para esta operação.' })
  })

  it('texto desconhecido do banco ou erro de infraestrutura não vazam para a tela', async () => {
    reply = dbError(500, 'XX000', 'relation "private.membership_requests" is broken')
    const result = await decide({ intent: 'approve', request: R })
    expect(result).toMatchObject({ ok: false, status: 503, error: 'Não foi possível concluir a operação. Tente novamente.' })
    expect(JSON.stringify(result)).not.toContain('membership_requests')
    reply = dbError(400, '22023', 'Mensagem nova que a tela não conhece')
    expect(await decide({ intent: 'approve', request: R })).toMatchObject({ ok: false, status: 503 })
  })

  it('sessão expirada (401) pede novo login', async () => {
    reply = () => Response.json({ code: '42501', message: 'permission denied for function decide_collective_request' }, { status: 401 })
    expect(await decide({ intent: 'approve', request: R })).toMatchObject({ ok: false, status: 401, error: 'Sua sessão expirou. Entre novamente para continuar.' })
  })

  it('decisão ou pedido inválidos não chegam ao banco', async () => {
    expect(await decide({ intent: 'delete', request: R })).toMatchObject({ ok: false, status: 400, error: 'Decisão inválida.' })
    expect(await decide({ intent: 'approve', request: 'qualquer-coisa' })).toMatchObject({ ok: false, status: 400, error: 'Pedido inválido.' })
    expect(await decide({ intent: 'approve' })).toMatchObject({ ok: false, status: 400 })
    expect(sent).toEqual([])
  })

  it('recusa método, caminho e origem indevidos antes de qualquer RPC', async () => {
    const get = new Request(origin + path, { method: 'GET' })
    expect(await outcome(collectiveRequestsAction(get, C))).toMatchObject({ ok: false, status: 405 })
    const other = post('/coletivo/05000000-0000-4000-8000-000000000001/solicitacoes', { intent: 'approve', request: R })
    expect(await outcome(collectiveRequestsAction(other, C))).toMatchObject({ ok: false, status: 405 })
    expect(await decide({ intent: 'approve', request: R }, { headers: { Origin: 'https://evil.example.invalid' } })).toMatchObject({ ok: false, status: 403, error: 'Origem recusada.' })
    expect(await decide({ intent: 'approve', request: R }, { headers: { 'Sec-Fetch-Site': 'cross-site' } })).toMatchObject({ ok: false, status: 403 })
    vi.stubEnv('APP_ORIGIN', '')
    expect(await decide({ intent: 'approve', request: R })).toMatchObject({ ok: false, status: 403 })
    expect(sent).toEqual([])
  })

  it('exige formulário urlencoded e limita o tamanho do corpo', async () => {
    const json = post(path, {}, { headers: { 'Content-Type': 'application/json' }, body: '{}' })
    expect(await outcome(collectiveRequestsAction(json, C))).toMatchObject({ ok: false, status: 415 })
    const big = post(path, {}, { body: 'x='.padEnd(5000, 'a') })
    expect(await outcome(collectiveRequestsAction(big, C))).toMatchObject({ ok: false, status: 413 })
    expect(sent).toEqual([])
  })

  it('coletivo que não é UUID responde 404 sem tentar nada', () => {
    expect(() => collectiveRequestsAction(post('/coletivo/x/solicitacoes', {}), 'x')).toThrow()
  })
})

describe('myCollectivesAction', () => {
  const path = '/painel/coletivos'
  const run = (fields: Record<string, string>, init = {}) => outcome(myCollectivesAction(post(path, fields, init)))

  it('pede entrada com a atuação escolhida e a apresentação', async () => {
    reply = () => Response.json(R)
    const result = await run({ intent: 'request', collective: C, profile: P, message: '  Toco techno.  ' })
    expect(sent).toEqual([{ name: 'request_collective_membership', body: { target: C, profile: P, message: 'Toco techno.' } }])
    expect(result).toMatchObject({ ok: true, status: 200, message: 'Pedido enviado. A administração do coletivo vai analisá-lo.' })
  })

  it('sem atuação nem mensagem envia só o coletivo e a apresentação vazia', async () => {
    reply = () => Response.json(R)
    await run({ intent: 'request', collective: C, profile: '', message: '' })
    expect(sent[0].body).toEqual({ target: C, message: '' })
  })

  it('normaliza quebras de linha do navegador (CRLF) antes de contar e enviar', async () => {
    reply = () => Response.json(R)
    await run({ intent: 'request', collective: C, message: 'a\r\nb' })
    expect(sent[0].body.message).toBe('a\nb')
    const long = await run({ intent: 'request', collective: C, message: 'x'.repeat(2001) })
    expect(long).toMatchObject({ ok: false, status: 422, error: 'A apresentação pode ter até 2.000 caracteres.' })
  })

  it('valida coletivo e atuação antes do banco', async () => {
    expect(await run({ intent: 'request', collective: '' })).toMatchObject({ ok: false, status: 400, error: 'Escolha um coletivo.' })
    expect(await run({ intent: 'request', collective: C, profile: 'meu-perfil' })).toMatchObject({ ok: false, status: 400, error: 'Escolha uma das suas atuações.' })
    expect(await run({ intent: 'tornar-se-dono', collective: C })).toMatchObject({ ok: false, status: 400, error: 'Operação inválida.' })
    expect(sent).toEqual([])
  })

  it.each([
    ['Conta já vinculada', 409, 'Você já faz parte deste coletivo.'],
    ['Já existe pedido com outra apresentação', 409, 'Você já tem um pedido pendente neste coletivo com outra apresentação. Cancele-o antes de enviar um novo.'],
    ['Apresentação inválida', 422, 'A apresentação é inválida: use até 2.000 caracteres e uma das suas próprias atuações.'],
    ['Coletivo indisponível', 409, 'Este coletivo não está disponível para pedidos de entrada.'],
  ])('erro do banco "%s" chega traduzido', async (message, status, expected) => {
    reply = dbError(400, '22023', message)
    expect(await run({ intent: 'request', collective: C })).toEqual(expect.objectContaining({ ok: false, status, error: expected }))
  })

  it('cancela um pedido pendente pelo RPC', async () => {
    const result = await run({ intent: 'cancel', request: R })
    expect(sent).toEqual([{ name: 'cancel_collective_request', body: { target_request: R } }])
    expect(result).toMatchObject({ ok: true, message: 'Pedido cancelado.' })
  })

  it('cancelar pedido que não está mais pendente mostra o erro do banco, não sucesso', async () => {
    reply = dbError(403, '42501', 'Pedido indisponível')
    expect(await run({ intent: 'cancel', request: R })).toMatchObject({ ok: false, status: 409, error: 'Este pedido não está mais pendente.' })
    expect(await run({ intent: 'cancel', request: 'x' })).toMatchObject({ ok: false, status: 400, error: 'Pedido inválido.' })
  })

  it('aceita o sufixo .data e recusa outro caminho', async () => {
    expect(await outcome(myCollectivesAction(post(`${path}.data`, { intent: 'cancel', request: R })))).toMatchObject({ ok: true })
    expect(await outcome(myCollectivesAction(post('/painel/dados', { intent: 'cancel', request: R })))).toMatchObject({ ok: false, status: 405 })
  })
})

describe('rpcFailure', () => {
  it('usa só mensagens conhecidas, e apenas com o código de erro que as funções do banco usam', () => {
    expect(rpcFailure({ code: '42501', message: 'Operação não autorizada' }).status).toBe(403)
    expect(rpcFailure({ code: '23505', message: 'Operação não autorizada' }).status).toBe(503)
    expect(rpcFailure({ message: 'fetch failed' }).status).toBe(503)
    expect(rpcFailure({ code: '42501', message: 'Operação não autorizada' }, 401).status).toBe(401)
  })
})

describe('supabaseRouteHeaders', () => {
  it('repassa cabeçalhos privados e Set-Cookie do loader, da ação e do erro', () => {
    const loaderHeaders = new Headers({ 'Cache-Control': 'private, no-store' })
    const actionHeaders = new Headers({ Vary: 'Cookie' })
    actionHeaders.append('Set-Cookie', 'sb-a=1; Path=/')
    const errorHeaders = new Headers()
    errorHeaders.append('Set-Cookie', 'sb-b=2; Path=/')
    const result = supabaseRouteHeaders({ loaderHeaders, actionHeaders, errorHeaders, parentHeaders: new Headers() })
    const headers = result as Headers
    expect(headers.get('cache-control')).toBe('private, no-store')
    expect(headers.get('vary')).toBe('Cookie')
    expect(headers.getSetCookie()).toEqual(['sb-a=1; Path=/', 'sb-b=2; Path=/'])
  })
})
