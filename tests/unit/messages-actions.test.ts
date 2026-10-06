// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { messagesAction, newMessageAction } from '../../src/server/messages.server'

const origin = 'https://circuitone-dev.magalz.space'
const ME = '02000000-0000-4000-8000-000000000001'
const OTHER = '02000000-0000-4000-8000-000000000007'
const C = '05000000-0000-4000-8000-000000000001'
const CONV = '0d000000-0000-4000-8000-000000000001'
const MSG = '0e000000-0000-4000-8000-000000000001'
const REQ = '0b000000-0000-4000-8000-000000000001'
const via = `profile:${ME}>profile:${OTHER}`

type Sent = { name: string; body: Record<string, unknown> }
let sent: Sent[]
let reply: (name: string, body: Record<string, unknown>) => Response

beforeEach(() => {
  sent = []
  reply = (name) => (name === 'send_message' ? Response.json({ conversation_id: CONV, message_id: MSG }) : new Response(null, { status: 204 }))
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
      const body = init?.body ? JSON.parse(String(init.body)) : {}
      sent.push({ name, body })
      return reply(name, body)
    }),
  )
})
afterEach(() => vi.unstubAllEnvs())

const dbError = (status: number, code: string, message: string) => () => Response.json({ code, message, details: null, hint: null }, { status })
const post = (path: string, fields: Record<string, string>, init: { headers?: Record<string, string>; body?: BodyInit } = {}) =>
  new Request(origin + path, {
    method: 'POST',
    headers: { Origin: origin, 'Content-Type': 'application/x-www-form-urlencoded', ...init.headers },
    body: init.body ?? new URLSearchParams(fields),
  })
const outcome = async (promise: Promise<unknown>) => {
  const result = (await promise) as { data: { ok: boolean; message?: string; error?: string }; init: { status: number; headers: Headers } }
  return { ...result.data, status: result.init.status, headers: result.init.headers }
}

describe('messagesAction (conta)', () => {
  const path = `/painel/mensagens/${CONV}`
  const run = (fields: Record<string, string>, init = {}) => outcome(messagesAction(post(path, fields, init), { kind: 'account' }, CONV))

  it('envia pelo RPC com a atuação escolhida, a chave de idempotência e o texto normalizado', async () => {
    const result = await run({ intent: 'send', via, request_id: REQ, body: '  Olá\r\nmundo  ' })
    expect(sent).toEqual([
      { name: 'send_message', body: { sender_kind: 'profile', sender: ME, recipient_kind: 'profile', recipient: OTHER, body: 'Olá\nmundo', request_id: REQ } },
    ])
    expect(result).toMatchObject({ ok: true, status: 200, message: 'Mensagem enviada.' })
    expect(result.headers.get('cache-control')).toContain('no-store')
  })

  it('sem chave de idempotência (sem JavaScript) o servidor gera uma; chave inválida também é trocada', async () => {
    await run({ intent: 'send', via, body: 'a' })
    await run({ intent: 'send', via, body: 'a', request_id: 'x' })
    for (const { body } of sent) expect(String(body.request_id)).toMatch(/^[0-9a-f-]{36}$/)
  })

  it('aceita 2.000 caracteres mesmo com emojis (corpo bem maior que 4 KB) e recusa 2.001', async () => {
    expect(await run({ intent: 'send', via, body: '👋'.repeat(2000) })).toMatchObject({ ok: true })
    expect(await run({ intent: 'send', via, body: '👋'.repeat(2001) })).toMatchObject({ ok: false, status: 422, error: 'A mensagem pode ter até 2.000 caracteres.' })
    expect(sent).toHaveLength(1)
  })

  it('texto vazio e remetente inválido não chegam ao banco', async () => {
    expect(await run({ intent: 'send', via, body: '   ' })).toMatchObject({ ok: false, status: 422, error: 'Escreva uma mensagem.' })
    expect(await run({ intent: 'send', via: 'profile:x>profile:y', body: 'a' })).toMatchObject({ ok: false, status: 400 })
    expect(await run({ intent: 'send', body: 'a' })).toMatchObject({ ok: false, status: 400 })
    expect(await run({ intent: 'tornar-se-moderador' })).toMatchObject({ ok: false, status: 400, error: 'Operação inválida.' })
    expect(sent).toEqual([])
  })

  it.each([
    ['Conversa bloqueada', '42501', 409, 'Esta conversa está bloqueada: ninguém pode enviar mensagens enquanto o bloqueio durar.'],
    ['Envio não autorizado', '42501', 403, 'Você não pode enviar mensagens por esta atuação ou coletivo, ou o interlocutor não está mais disponível.'],
    ['Interlocutor indisponível', '42501', 409, 'Este interlocutor não está disponível para receber mensagens.'],
    ['Limite de mensagens por minuto', '54000', 429, 'Muitas mensagens em pouco tempo. Aguarde um minuto e tente de novo.'],
    ['Limite de conversas por dia', '54000', 429, 'Você atingiu o limite de novas conversas de hoje. Tente de novo amanhã.'],
    ['Mensagem inválida', '22023', 422, 'Escreva uma mensagem de até 2.000 caracteres.'],
  ])('erro do banco "%s" chega traduzido e nunca como sucesso', async (message, code, status, error) => {
    reply = dbError(400, code, message)
    expect(await run({ intent: 'send', via, body: 'a' })).toEqual(expect.objectContaining({ ok: false, status, error }))
  })

  it('texto desconhecido do banco ou limite com errcode inesperado não vazam', async () => {
    reply = dbError(500, 'XX000', 'relation "private.messages" is broken')
    const result = await run({ intent: 'send', via, body: 'a' })
    expect(result).toMatchObject({ ok: false, status: 503 })
    expect(JSON.stringify(result)).not.toContain('private.messages')
    reply = dbError(400, '23505', 'Conversa bloqueada')
    expect(await run({ intent: 'send', via, body: 'a' })).toMatchObject({ ok: false, status: 503 })
  })

  it('resposta do envio sem a conversa não é tratada como sucesso', async () => {
    reply = () => Response.json({})
    expect(await run({ intent: 'send', via, body: 'a' })).toMatchObject({ ok: false, status: 503 })
  })

  it('marca como lida com a última mensagem', async () => {
    expect(await run({ intent: 'read', last: MSG })).toMatchObject({ ok: true })
    expect(sent).toEqual([{ name: 'mark_conversation_read', body: { target: CONV, last_message: MSG } }])
    expect(await run({ intent: 'read', last: 'x' })).toMatchObject({ ok: false, status: 400 })
    reply = dbError(403, '42501', 'Leitura não autorizada')
    expect(await run({ intent: 'read', last: MSG })).toMatchObject({ ok: false, status: 403 })
  })

  it('bloqueia como a atuação escolhida', async () => {
    const result = await run({ intent: 'block', as: `profile:${ME}` })
    expect(sent).toEqual([{ name: 'set_conversation_block', body: { target: CONV, as_kind: 'profile', as_id: ME, blocked: true } }])
    expect(result).toMatchObject({ ok: true })
    expect(await run({ intent: 'block', as: 'x' })).toMatchObject({ ok: false, status: 400 })
    reply = dbError(403, '42501', 'Bloqueio não autorizado')
    expect(await run({ intent: 'block', as: `profile:${ME}` })).toMatchObject({ ok: false, status: 403 })
  })

  it('desbloqueia e confirma que o bloqueio de fato saiu', async () => {
    reply = (name) =>
      name === 'get_conversation_details'
        ? Response.json([{ conversation_id: CONV, last_message: null, blocked_by: [] }])
        : new Response(null, { status: 204 })
    expect(await run({ intent: 'unblock', as: `profile:${ME}` })).toMatchObject({ ok: true, message: 'Bloqueio removido.' })
    expect(sent.map((s) => s.name)).toEqual(['set_conversation_block', 'get_conversation_details'])
  })

  it('só quem bloqueou desbloqueia: o banco ignora o pedido do outro lado e a tela não diz que removeu', async () => {
    reply = (name) =>
      name === 'get_conversation_details'
        ? Response.json([{ conversation_id: CONV, last_message: null, blocked_by: [{ kind: 'profile', id: ME, name: 'Eu' }] }])
        : new Response(null, { status: 204 })
    expect(await run({ intent: 'unblock', as: `profile:${ME}` })).toMatchObject({ ok: false, status: 409 })
  })

  it('denuncia a mensagem com o motivo', async () => {
    reply = () => Response.json(REQ)
    expect(await run({ intent: 'report', message: MSG, reason: ' Spam\r\nrepetido ' })).toMatchObject({ ok: true })
    expect(sent).toEqual([{ name: 'report_message', body: { target: MSG, reason: 'Spam\nrepetido' } }])
    expect(await run({ intent: 'report', message: MSG, reason: '' })).toMatchObject({ ok: false, status: 422, error: 'Explique o motivo da denúncia.' })
    expect(await run({ intent: 'report', message: 'x', reason: 'a' })).toMatchObject({ ok: false, status: 400 })
    reply = dbError(400, '22023', 'Motivo necessário')
    expect(await run({ intent: 'report', message: MSG, reason: 'a' })).toMatchObject({ ok: false, status: 422 })
  })

  it('aceita o sufixo .data e recusa outro caminho, método e origem antes de qualquer RPC', async () => {
    const dataPath = post(`${path}.data`, { intent: 'read', last: MSG })
    expect(await outcome(messagesAction(dataPath, { kind: 'account' }, CONV))).toMatchObject({ ok: true })
    sent = []
    expect(await outcome(messagesAction(post('/painel/mensagens/outra', { intent: 'read', last: MSG }), { kind: 'account' }, CONV))).toMatchObject({ status: 405 })
    expect(await run({ intent: 'read', last: MSG }, { headers: { Origin: 'https://evil.example.invalid' } })).toMatchObject({ ok: false, status: 403 })
    expect(await outcome(messagesAction(new Request(origin + path, { method: 'GET' }), { kind: 'account' }, CONV))).toMatchObject({ status: 405 })
    expect(sent).toEqual([])
  })

  it('conversa que não é UUID ou ausente responde 404', () => {
    expect(() => messagesAction(post('/painel/mensagens/x', {}), { kind: 'account' }, 'x')).toThrow()
    expect(() => messagesAction(post('/painel/mensagens', {}), { kind: 'account' }, undefined)).toThrow()
  })

  it('o corpo limita-se a 32 KB', async () => {
    const big = post(path, {}, { body: 'body='.padEnd(40_000, 'a') })
    expect(await outcome(messagesAction(big, { kind: 'account' }, CONV))).toMatchObject({ ok: false, status: 413 })
  })
})

describe('messagesAction (coletivo)', () => {
  it('só aceita o caminho do coletivo e envia como o coletivo', async () => {
    const path = `/coletivo/${C}/mensagens/${CONV}`
    const as = `collective:${C}>profile:${OTHER}`
    const result = await outcome(messagesAction(post(path, { intent: 'send', via: as, body: 'Resposta' }), { kind: 'collective', id: C }, CONV))
    expect(result).toMatchObject({ ok: true })
    expect(sent[0].body).toMatchObject({ sender_kind: 'collective', sender: C, recipient_kind: 'profile', recipient: OTHER })
    const wrong = await outcome(messagesAction(post(`/painel/mensagens/${CONV}`, { intent: 'read', last: MSG }), { kind: 'collective', id: C }, CONV))
    expect(wrong).toMatchObject({ status: 405 })
  })

  it('sem "enviar mensagens" o banco recusa e a tela mostra o motivo', async () => {
    reply = dbError(403, '42501', 'Envio não autorizado')
    const path = `/coletivo/${C}/mensagens/${CONV}`
    const result = await outcome(messagesAction(post(path, { intent: 'send', via: `collective:${C}>profile:${OTHER}`, body: 'a' }), { kind: 'collective', id: C }, CONV))
    expect(result).toMatchObject({ ok: false, status: 403 })
  })
})

describe('newMessageAction', () => {
  const path = '/painel/mensagens/nova'
  const run = (fields: Record<string, string>) => newMessageAction(post(path, fields)) as Promise<Response & { init?: unknown }>

  it('cria a conversa e leva para ela, mantendo os cookies da resposta', async () => {
    const response = (await run({ via, body: 'Primeira mensagem', request_id: REQ })) as Response
    expect(response.status).toBe(302)
    expect(response.headers.get('location')).toBe(`/painel/mensagens/${CONV}`)
    expect(response.headers.get('cache-control')).toContain('no-store')
    expect(sent[0].body).toMatchObject({ sender: ME, recipient: OTHER, request_id: REQ, body: 'Primeira mensagem' })
  })

  it('enviando como coletivo leva para a área do coletivo', async () => {
    const response = (await run({ via: `collective:${C}>profile:${OTHER}`, body: 'Do coletivo' })) as Response
    expect(response.headers.get('location')).toBe(`/coletivo/${C}/mensagens/${CONV}`)
  })

  it('falha do banco devolve o erro traduzido, sem redirecionar', async () => {
    reply = dbError(403, '42501', 'Interlocutor indisponível')
    const result = await outcome(run({ via, body: 'a' }))
    expect(result).toMatchObject({ ok: false, status: 409, error: 'Este interlocutor não está disponível para receber mensagens.' })
  })

  it('recusa outro caminho', async () => {
    expect(await outcome(newMessageAction(post('/painel/mensagens', { via, body: 'a' })))).toMatchObject({ status: 405 })
    expect(sent).toEqual([])
  })
})
