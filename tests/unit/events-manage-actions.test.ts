// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { eventCreateAction, eventManageAction } from '../../src/server/events-manage.server'
import { rpcFailure } from '../../src/server/mutation.server'

const origin = 'https://circuitone-dev.magalz.space'
const C = '05000000-0000-4000-8000-000000000001'
const E = '0a000000-0000-4000-8000-000000000005'
const NEW_EVENT = '0a000000-0000-4000-8000-000000000099'
const REQUEST = '0b000000-0000-4000-8000-000000000001'
const ARTIST = '02000000-0000-4000-8000-000000000001'

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

const post = (path: string, fields: Record<string, string | string[]>, init: { headers?: Record<string, string>; method?: string; body?: BodyInit } = {}) => {
  const body = new URLSearchParams()
  for (const [key, value] of Object.entries(fields)) for (const v of Array.isArray(value) ? value : [value]) body.append(key, v)
  return new Request(origin + path, {
    method: init.method ?? 'POST',
    headers: { Origin: origin, 'Content-Type': 'application/x-www-form-urlencoded', ...init.headers },
    body: init.body ?? body,
  })
}

/** Lê o resultado de `data()` sem depender dos detalhes do React Router. */
const outcome = async (promise: Promise<unknown>) => {
  const result = (await promise) as { data: { ok: boolean; message?: string; error?: string; fields?: Record<string, string> }; init: { status: number; headers: Headers } }
  return { ...result.data, status: result.init.status, headers: result.init.headers }
}

const eventFields = (extra: Record<string, string | string[]> = {}) => ({
  name: 'Festa sintética',
  kind: 'festa',
  description: 'Texto **forte**',
  starts_at: '2030-05-10T20:00',
  ends_at: '2030-05-11T02:00',
  state_code: 'PE',
  city: 'Recife',
  venue: 'Local sintético',
  ticket_url: 'https://tickets.example.invalid/e',
  cover_url: '',
  lineup: [`a:${ARTIST}`, 'n:Convidada livre'],
  ...extra,
})

describe('eventCreateAction', () => {
  const path = `/coletivo/${C}/eventos/novo`
  const create = (fields: Record<string, string | string[]>, init = {}) => eventCreateAction(post(path, fields, init), C)
  const createOutcome = (fields: Record<string, string | string[]>, init = {}) => outcome(create(fields, init))

  it('cria o rascunho pelo RPC e só então redireciona para a gestão do evento, com cookies privados', async () => {
    reply = () => Response.json(NEW_EVENT)
    const response = (await create({ ...eventFields(), request: REQUEST })) as Response
    expect(sent).toEqual([
      {
        name: 'create_event',
        body: {
          collective: C,
          request_id: REQUEST,
          payload: {
            name: 'Festa sintética',
            kind: 'festa',
            other_kind: null,
            description: 'Texto **forte**',
            starts_at: '2030-05-10T23:00:00.000Z',
            ends_at: '2030-05-11T05:00:00.000Z',
            state_code: 'PE',
            city: 'Recife',
            venue: 'Local sintético',
            is_free: false,
            ticket_url: 'https://tickets.example.invalid/e',
            cover_url: null,
            lineup: [{ artist_id: ARTIST }, { name: 'Convidada livre' }],
          },
        },
      },
    ])
    expect(response).toBeInstanceOf(Response)
    expect(response.status).toBe(302)
    expect(response.headers.get('location')).toBe(`/coletivo/${C}/eventos/${NEW_EVENT}`)
    expect(response.headers.get('cache-control')).toContain('no-store')
  })

  it('reenvio do mesmo formulário usa a mesma solicitação (o banco devolve o mesmo evento)', async () => {
    reply = () => Response.json(NEW_EVENT)
    const first = (await create({ ...eventFields(), request: REQUEST })) as Response
    const second = (await create({ ...eventFields(), request: REQUEST })) as Response
    expect(sent.map((s) => s.body.request_id)).toEqual([REQUEST, REQUEST])
    expect(second.headers.get('location')).toBe(first.headers.get('location'))
  })

  it('normaliza o sufixo .data do single fetch', async () => {
    reply = () => Response.json(NEW_EVENT)
    const response = (await eventCreateAction(post(`${path}.data`, { ...eventFields(), request: REQUEST }), C)) as Response
    expect(response.status).toBe(302)
  })

  it('validação por campo antes do banco: 422 com a mensagem de cada campo, nenhum RPC', async () => {
    const result = await createOutcome({ ...eventFields({ name: '', ends_at: '2030-05-10T19:00', ticket_url: '' }), request: REQUEST })
    expect(result).toMatchObject({
      ok: false,
      status: 422,
      error: 'Corrija os campos destacados.',
      fields: { name: 'Informe o nome do evento.', ends_at: 'O fim deve ser posterior ao início.', ticket_url: 'Informe o link de ingresso ou marque o evento como gratuito.' },
    })
    expect(sent).toEqual([])
  })

  it('identificador da solicitação ausente ou inválido não chega ao banco', async () => {
    expect(await createOutcome(eventFields())).toMatchObject({ ok: false, status: 400, error: 'Formulário inválido. Recarregue a página e tente de novo.' })
    expect(await createOutcome({ ...eventFields(), request: 'qualquer-coisa' })).toMatchObject({ ok: false, status: 400 })
    expect(sent).toEqual([])
  })

  it.each([
    ['Operação não autorizada', 42501, 403, 'Você não tem permissão para esta operação.'],
    ['Artista público indisponível', 22023, 422, 'Um artista do lineup não está mais público. Remova-o ou informe só o nome.'],
    ['Dados de evento/lineup inválidos', 22023, 422, 'O banco recusou os dados do evento. Revise os campos e tente de novo.'],
    ['Solicitação reutilizada com outros dados', 22023, 409, 'Este formulário já criou um evento com outros dados. Recarregue a página para criar outro.'],
  ])('erro do banco "%s" chega traduzido e nunca como sucesso', async (message, code, status, expected) => {
    reply = dbError(400, String(code), message)
    expect(await createOutcome({ ...eventFields(), request: REQUEST })).toMatchObject({ ok: false, status, error: expected })
  })

  it('texto desconhecido do banco e resposta sem identificador não vazam nem fingem sucesso', async () => {
    reply = dbError(500, 'XX000', 'relation "private.event_details" is broken')
    const result = await createOutcome({ ...eventFields(), request: REQUEST })
    expect(result).toMatchObject({ ok: false, status: 503, error: 'Não foi possível concluir a operação. Tente novamente.' })
    expect(JSON.stringify(result)).not.toContain('event_details')
    reply = () => Response.json({ not: 'a uuid' })
    expect(await createOutcome({ ...eventFields(), request: REQUEST })).toMatchObject({ ok: false, status: 503 })
  })

  it('recusa método, caminho, origem e tipo de conteúdo indevidos antes de qualquer RPC', async () => {
    expect(await outcome(eventCreateAction(new Request(origin + path, { method: 'GET' }), C))).toMatchObject({ ok: false, status: 405 })
    expect(await outcome(eventCreateAction(post(`/coletivo/${C}/eventos/${E}`, eventFields()), C))).toMatchObject({ ok: false, status: 405 })
    expect(await createOutcome(eventFields(), { headers: { Origin: 'https://evil.example.invalid' } })).toMatchObject({ ok: false, status: 403, error: 'Origem recusada.' })
    expect(await createOutcome(eventFields(), { headers: { 'Sec-Fetch-Site': 'cross-site' } })).toMatchObject({ ok: false, status: 403 })
    const json = post(path, {}, { headers: { 'Content-Type': 'application/json' }, body: '{}' })
    expect(await outcome(eventCreateAction(json, C))).toMatchObject({ ok: false, status: 415 })
    expect(sent).toEqual([])
  })

  it('aceita o corpo de um evento com descrição longa, mas continua limitando o tamanho', async () => {
    reply = () => Response.json(NEW_EVENT)
    // 20.000 caracteres acentuados passam dos 4 KiB de outras ações, e continuam dentro do limite do formulário de evento.
    const long = await create({ ...eventFields({ description: 'á'.repeat(20000) }), request: REQUEST })
    expect((long as Response).status).toBe(302)
    const huge = post(path, {}, { body: 'x='.padEnd(400 * 1024, 'a') })
    expect(await outcome(eventCreateAction(huge, C))).toMatchObject({ ok: false, status: 413 })
  })

  it('coletivo que não é UUID responde 404 sem tentar nada', () => {
    expect(() => eventCreateAction(post('/coletivo/x/eventos/novo', {}), 'x')).toThrow()
  })
})

describe('eventManageAction', () => {
  const path = `/coletivo/${C}/eventos/${E}`
  const manage = (fields: Record<string, string | string[]>, init = {}) => outcome(eventManageAction(post(path, fields, init), C, E))

  it('salva as alterações com a versão que a pessoa viu', async () => {
    const result = await manage({ ...eventFields({ name: 'Nome novo' }), intent: 'update', version: '3' })
    expect(sent).toHaveLength(1)
    expect(sent[0]).toMatchObject({ name: 'update_event', body: { target: E, expected_version: 3, payload: { name: 'Nome novo', lineup: [{ artist_id: ARTIST }, { name: 'Convidada livre' }] } } })
    expect(result).toMatchObject({ ok: true, status: 200, message: 'Alterações salvas.' })
    expect(result.headers.get('cache-control')).toContain('no-store')
  })

  it('lineup vazio é enviado como lista vazia (substitui o anterior)', async () => {
    await manage({ ...eventFields({ lineup: [] }), intent: 'update', version: '3' })
    expect((sent[0].body.payload as { lineup: unknown[] }).lineup).toEqual([])
  })

  it('publica e cancela pelo RPC correspondente, cada um com a versão enviada', async () => {
    expect(await manage({ intent: 'publish', version: '4' })).toMatchObject({ ok: true, message: 'Evento publicado. Ele já aparece na agenda pública.' })
    expect(await manage({ intent: 'cancel', version: '5' })).toMatchObject({ ok: true, message: 'Evento cancelado.' })
    expect(sent).toEqual([
      { name: 'publish_event', body: { target: E, expected_version: 4 } },
      { name: 'cancel_event', body: { target: E, expected_version: 5 } },
    ])
  })

  it('conflito de versão (40001) vira 409 com mensagem clara, não sucesso', async () => {
    reply = dbError(409, '40001', 'Evento alterado; recarregue')
    for (const intent of ['update', 'publish', 'cancel']) {
      const result = await manage({ ...eventFields(), intent, version: '2' })
      expect(result).toMatchObject({ ok: false, status: 409 })
      expect(result.error).toMatch(/alterado por outra pessoa/)
    }
  })

  it.each([
    ['Edição pública exige publicar', '42501', 403, 'Alterar um evento publicado exige também a permissão de publicar eventos.'],
    ['Operação não autorizada', '42501', 403, 'Você não tem permissão para esta operação.'],
    ['Evento cancelado não aceita edição', '22023', 409, 'Este evento foi cancelado e não pode mais ser editado.'],
    ['Transição inválida', '22023', 409, 'Só rascunhos podem ser publicados.'],
    ['Evento indisponível', '42501', 404, 'Evento não encontrado.'],
  ])('erro do banco "%s" chega traduzido', async (message, code, status, expected) => {
    reply = dbError(400, code, message)
    expect(await manage({ ...eventFields(), intent: 'update', version: '1' })).toMatchObject({ ok: false, status, error: expected })
  })

  it('o código do erro importa: a mesma mensagem com outro SQLSTATE não é traduzida', async () => {
    reply = dbError(400, '23505', 'Evento alterado; recarregue')
    expect(await manage({ intent: 'publish', version: '1' })).toMatchObject({ ok: false, status: 503 })
  })

  it('operação, versão e campos inválidos não chegam ao banco', async () => {
    expect(await manage({ intent: 'delete', version: '1' })).toMatchObject({ ok: false, status: 400, error: 'Operação inválida.' })
    expect(await manage({ version: '1' })).toMatchObject({ ok: false, status: 400 })
    for (const version of ['', '0', '-1', '1.5', 'abc', '99999999999']) expect(await manage({ intent: 'publish', version }), version).toMatchObject({ ok: false, status: 400 })
    expect(await manage({ intent: 'publish' })).toMatchObject({ ok: false, status: 400 })
    expect(await manage({ ...eventFields({ city: '' }), intent: 'update', version: '1' })).toMatchObject({ ok: false, status: 422, fields: { city: 'Informe a cidade.' } })
    expect(sent).toEqual([])
  })

  it('sessão expirada pede novo login', async () => {
    reply = () => Response.json({ code: '42501', message: 'permission denied' }, { status: 401 })
    expect(await manage({ intent: 'cancel', version: '1' })).toMatchObject({ ok: false, status: 401, error: 'Sua sessão expirou. Entre novamente para continuar.' })
  })

  it('aceita o sufixo .data e recusa o caminho de outro evento, o método GET e a origem externa', async () => {
    expect(await outcome(eventManageAction(post(`${path}.data`, { intent: 'publish', version: '1' }), C, E))).toMatchObject({ ok: true })
    sent.length = 0
    const other = post(`/coletivo/${C}/eventos/${NEW_EVENT}`, { intent: 'publish', version: '1' })
    expect(await outcome(eventManageAction(other, C, E))).toMatchObject({ ok: false, status: 405 })
    expect(await outcome(eventManageAction(new Request(origin + path), C, E))).toMatchObject({ ok: false, status: 405 })
    expect(await manage({ intent: 'publish', version: '1' }, { headers: { Origin: 'https://evil.example.invalid' } })).toMatchObject({ ok: false, status: 403 })
    expect(sent).toEqual([])
  })

  it('identificadores que não são UUID respondem 404 sem tentar nada', () => {
    expect(() => eventManageAction(post(path, {}), 'x', E)).toThrow()
    expect(() => eventManageAction(post(path, {}), C, 'x')).toThrow()
  })
})

describe('rpcFailure para eventos', () => {
  it('conflito de versão só vale com o código 40001 (ou os demais usados pelo banco)', () => {
    expect(rpcFailure({ code: '40001', message: 'Evento alterado; recarregue' }).status).toBe(409)
    expect(rpcFailure({ code: '22023', message: 'Evento alterado; recarregue' }).status).toBe(409)
    expect(rpcFailure({ code: '40P01', message: 'Evento alterado; recarregue' }).status).toBe(503)
  })
})
