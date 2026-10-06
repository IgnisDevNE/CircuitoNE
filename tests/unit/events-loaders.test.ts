// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { loadEventList, loadEventPage } from '../../src/server/events.server'
import { HttpError, type SupabaseServerClient } from '../../src/server/supabase.server'

const listRow = (n: number, extra = {}) => ({
  id: `0a000000-0000-4000-8000-00000000000${n}`,
  collective_id: '05000000-0000-4000-8000-000000000001',
  name: `Evento sintético ${n}`,
  kind: 'festa',
  starts_at: '2026-10-07T15:00:00+00:00',
  ends_at: null,
  timezone: 'America/Fortaleza',
  city: 'Recife',
  state_code: 'PE',
  venue: 'Local sintético',
  is_free: true,
  ticket_url: null,
  cover_url: null,
  cover_path: null,
  rescheduled_at: null,
  ...extra,
})
const detailRow = {
  ...listRow(1),
  other_kind: null,
  description: 'Descrição',
  state: 'published',
  period: 'future',
  lineup: [{ name: 'Artista sintético público', artist_id: '02000000-0000-4000-8000-000000000001' }],
}

type Result = { data: unknown; error: unknown }
const ok = (data: unknown): Result => ({ data, error: null })
const failure: Result = { data: null, error: { message: 'boom', code: 'PGRST000' } }

function fakeClient(rpc: Record<string, Result | (() => Promise<Result>)>, collective: Result = ok(null)) {
  const maybeSingle = vi.fn(async () => collective)
  const eq = vi.fn(() => ({ maybeSingle }))
  const select = vi.fn(() => ({ eq }))
  const client = {
    rpc: vi.fn(async (name: string, args: unknown) => {
      const entry = rpc[name === 'list_events' ? `${name}:${(args as { period: string }).period}` : name]
      if (!entry) throw new Error(`rpc inesperado: ${name}`)
      return typeof entry === 'function' ? entry() : entry
    }),
    from: vi.fn(() => ({ select })),
  }
  return { client: client as unknown as SupabaseServerClient, spies: { rpc: client.rpc, from: client.from, select, eq } }
}

describe('loadEventList', () => {
  it('traz em andamento e futuros, cada grupo na ordem do banco', async () => {
    const { client, spies } = fakeClient({
      'list_events:ongoing': ok([listRow(2)]),
      'list_events:future': ok([listRow(1), listRow(6)]),
    })
    const data = await loadEventList(client)
    expect(data.ongoing.map((e) => e.nome)).toEqual(['Evento sintético 2'])
    expect(data.future.map((e) => e.nome)).toEqual(['Evento sintético 1', 'Evento sintético 6'])
    expect(spies.rpc).toHaveBeenCalledWith('list_events', { period: 'ongoing' })
    expect(spies.rpc).toHaveBeenCalledWith('list_events', { period: 'future' })
  })

  it('lista vazia é um resultado válido', async () => {
    const { client } = fakeClient({ 'list_events:ongoing': ok([]), 'list_events:future': ok([]) })
    expect(await loadEventList(client)).toEqual({ ongoing: [], future: [] })
  })

  it('erro do RPC vira 503 e nunca uma lista vazia', async () => {
    const { client } = fakeClient({ 'list_events:ongoing': ok([]), 'list_events:future': failure })
    await expect(loadEventList(client)).rejects.toMatchObject({ status: 503 })
  })

  it('resposta malformada falha em vez de ser descartada', async () => {
    const { client } = fakeClient({ 'list_events:ongoing': ok({}), 'list_events:future': ok([]) })
    await expect(loadEventList(client)).rejects.toThrow('Resposta inválida')
  })
})

describe('loadEventPage', () => {
  it('carrega o evento, o line-up e o coletivo (nome e cor)', async () => {
    const { client, spies } = fakeClient(
      { get_event: ok(detailRow) },
      ok({ id: detailRow.collective_id, name: 'Organização sintética 1', color: '#00ff99' }),
    )
    const page = await loadEventPage(client, detailRow.id)
    expect(page.evento.nome).toBe('Evento sintético 1')
    expect(page.evento.lineup).toEqual([
      { artistaId: '02000000-0000-4000-8000-000000000001', nome: 'Artista sintético público' },
    ])
    expect(page.coletivo).toEqual({ id: detailRow.collective_id, nome: 'Organização sintética 1', cor: '#00ff99' })
    expect(spies.rpc).toHaveBeenCalledWith('get_event', { target: detailRow.id })
    expect(spies.from).toHaveBeenCalledWith('collectives')
    expect(spies.select).toHaveBeenCalledWith('id,name,color')
    expect(spies.eq).toHaveBeenCalledWith('id', detailRow.collective_id)
  })

  it('omite o coletivo quando o RLS não o expõe', async () => {
    const { client } = fakeClient({ get_event: ok(detailRow) })
    expect((await loadEventPage(client, detailRow.id)).coletivo).toBeNull()
  })

  it('UUID inválido é 404 sem consultar o banco', async () => {
    const { client, spies } = fakeClient({})
    await expect(loadEventPage(client, 'ev-porto')).rejects.toMatchObject({ status: 404 })
    expect(spies.rpc).not.toHaveBeenCalled()
  })

  it('evento invisível (null) é 404', async () => {
    const { client } = fakeClient({ get_event: ok(null) })
    const error = await loadEventPage(client, detailRow.id).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(HttpError)
    expect(error).toMatchObject({ status: 404, message: 'Evento não encontrado.' })
  })

  it('erro no RPC ou na consulta do coletivo é 503', async () => {
    await expect(loadEventPage(fakeClient({ get_event: failure }).client, detailRow.id)).rejects.toMatchObject({ status: 503 })
    await expect(
      loadEventPage(fakeClient({ get_event: ok(detailRow) }, failure).client, detailRow.id),
    ).rejects.toMatchObject({ status: 503 })
  })
})

describe('loaders das rotas', () => {
  const origin = 'https://circuitone-dev.magalz.space'
  let paths: string[]
  beforeEach(() => {
    paths = []
    vi.stubEnv('CIRCUITONE_RUNTIME', 'development')
    vi.stubEnv('SUPABASE_URL', 'https://odphoxozclrshqjgwbqk.supabase.co')
    vi.stubEnv('SUPABASE_PUBLISHABLE_KEY', 'sb_publishable_synthetic')
  })
  afterEach(() => vi.unstubAllEnvs())
  const stubFetch = (handler: (path: string) => Response | Promise<Response>) =>
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string | URL | Request) => {
        const path = new URL(String(url)).pathname
        paths.push(path)
        return handler(path)
      }),
    )
  const thrown = async (promise: Promise<unknown>) => promise.then(() => null, (e: unknown) => e as { data: unknown; init: ResponseInit })

  it('agenda: entrega dados com cabeçalhos privados e consulta só RPCs públicos', async () => {
    const { loader } = await import('../../src/routes/events')
    stubFetch((path) => Response.json(path.endsWith('list_events') ? [] : null))
    const result = (await loader({ request: new Request(origin + '/eventos') } as never)) as unknown as {
      data: unknown
      init: { headers: Headers }
    }
    expect(result.data).toEqual({ ongoing: [], future: [] })
    expect(result.init.headers.get('cache-control')).toContain('no-store')
    expect(result.init.headers.get('vary')).toContain('Cookie')
    expect(paths).toEqual(['/rest/v1/rpc/list_events', '/rest/v1/rpc/list_events'])
  })

  it('agenda: falha do PostgREST responde 503', async () => {
    const { loader } = await import('../../src/routes/events')
    stubFetch(() => Response.json({ message: 'down' }, { status: 500 }))
    const error = await thrown(loader({ request: new Request(origin + '/eventos') } as never) as Promise<unknown>)
    expect(error?.init.status).toBe(503)
    expect((error?.init.headers as Headers).get('cache-control')).toContain('no-store')
  })

  it('agenda: rede indisponível responde 503', async () => {
    const { loader } = await import('../../src/routes/events')
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('rede')))
    const error = await thrown(loader({ request: new Request(origin + '/eventos') } as never) as Promise<unknown>)
    expect(error?.init.status).toBe(503)
  })

  it('agenda: runtime de preview (sem Supabase) responde 503', async () => {
    const { loader } = await import('../../src/routes/events')
    vi.stubEnv('CIRCUITONE_RUNTIME', 'preview')
    stubFetch(() => Response.json([]))
    const error = await thrown(loader({ request: new Request(origin + '/eventos') } as never) as Promise<unknown>)
    expect(error?.init.status).toBe(503)
    expect(paths).toEqual([])
  })

  it('evento: id desconhecido responde 404 e id inexistente no banco também', async () => {
    const { loader } = await import('../../src/routes/event')
    stubFetch(() => Response.json(null))
    const bad = await thrown(loader({ request: new Request(origin + '/eventos/x'), params: { id: 'x' } } as never) as Promise<unknown>)
    expect(bad?.init.status).toBe(404)
    expect(paths).toEqual([])
    const missing = await thrown(
      loader({ request: new Request(origin), params: { id: '0a000000-0000-4000-8000-0000000000ff' } } as never) as Promise<unknown>,
    )
    expect(missing?.init.status).toBe(404)
    expect(missing?.data).toEqual({ message: 'Evento não encontrado.' })
  })

  it('evento: carrega detalhe e coletivo pelo PostgREST', async () => {
    const { loader } = await import('../../src/routes/event')
    stubFetch((path) =>
      path.endsWith('get_event')
        ? Response.json(detailRow)
        : Response.json({ id: detailRow.collective_id, name: 'Organização sintética 1', color: null }),
    )
    const result = (await loader({ request: new Request(origin), params: { id: detailRow.id } } as never)) as unknown as {
      data: { evento: { nome: string }; coletivo: { nome: string } }
    }
    expect(result.data.evento.nome).toBe('Evento sintético 1')
    expect(result.data.coletivo.nome).toBe('Organização sintética 1')
    expect(paths).toEqual(['/rest/v1/rpc/get_event', '/rest/v1/collectives'])
  })
})
