// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import { loadArtistOptions, loadEventCreate, loadEventManage } from '../../src/server/events-manage.server'
import { mapArtistOptions, mapManagedEvent } from '../../src/server/mappers/events-manage'
import { HttpError, type SupabaseServerClient } from '../../src/server/supabase.server'

const C = '05000000-0000-4000-8000-000000000001'
const OTHER = '05000000-0000-4000-8000-000000000006'
const E = '0a000000-0000-4000-8000-000000000005'
const ARTIST = '02000000-0000-4000-8000-000000000001'
const REQUEST_ID = '0b000000-0000-4000-8000-000000000001'

type Result = { data: unknown; error: unknown }
const ok = (data: unknown): Result => ({ data, error: null })
const failure: Result = { data: null, error: { message: 'boom', code: 'PGRST000' } }
const access = (permissions: string[], owner = false) => ({ owner, role_id: 'r', permissions })

const eventRow = (extra: Record<string, unknown> = {}) => ({
  id: E,
  collective_id: C,
  name: 'Evento sintético 5',
  kind: 'festa',
  other_kind: null,
  description: '# Olá',
  starts_at: '2030-05-10T23:00:00+00:00',
  ends_at: null,
  timezone: 'America/Fortaleza',
  city: 'Recife',
  state_code: 'PE',
  venue: 'Local',
  is_free: false,
  ticket_url: 'https://tickets.example.invalid/e',
  cover_url: null,
  state: 'draft',
  rescheduled_at: null,
  version: 3,
  period: 'future',
  lineup: [{ name: 'Artista sintético público', artist_id: ARTIST }, { name: 'Convidada livre', artist_id: null }],
  ...extra,
})

/** Cliente fake: RPCs por nome; `profiles` devolve a lista de artistas (e registra a consulta). */
function fakeClient(rpcs: Record<string, Result | ((args: Record<string, unknown>) => Result)>, artists: Result = ok([])) {
  const rpc = vi.fn(async (name: string, args: Record<string, unknown> = {}) => {
    const entry = rpcs[name]
    if (!entry) throw new Error(`rpc inesperado: ${name}`)
    return typeof entry === 'function' ? entry(args) : entry
  })
  const calls: { method: string; args: unknown[] }[] = []
  const from = vi.fn((table: string) => {
    if (table !== 'profiles') throw new Error(`tabela inesperada: ${table}`)
    const builder: Record<string, unknown> = {
      then: (resolve: (value: Result) => unknown, reject: (reason: unknown) => unknown) => Promise.resolve(artists).then(resolve, reject),
    }
    for (const method of ['select', 'eq', 'order', 'limit']) {
      builder[method] = (...args: unknown[]) => {
        calls.push({ method, args })
        return builder
      }
    }
    return builder
  })
  return { client: { rpc, from } as unknown as SupabaseServerClient, rpc, from, calls }
}
const rejects = async (promise: Promise<unknown>) => {
  try {
    await promise
  } catch (error) {
    return error as HttpError
  }
  throw new Error('esperava erro')
}

const artistRows = [{ id: ARTIST, name: 'Artista sintético público' }]

describe('loadArtistOptions', () => {
  it('lista só artistas, em ordem alfabética e com limite, pelo cliente informado', async () => {
    const { client, calls } = fakeClient({}, ok(artistRows))
    expect(await loadArtistOptions(client)).toEqual([{ id: ARTIST, nome: 'Artista sintético público' }])
    expect(calls).toEqual([
      { method: 'select', args: ['id,name'] },
      { method: 'eq', args: ['kind', 'artist'] },
      { method: 'order', args: ['name'] },
      { method: 'order', args: ['id'] },
      { method: 'limit', args: [500] },
    ])
  })

  it('erro do banco vira 503, nunca lista vazia', async () => {
    const { client } = fakeClient({}, failure)
    expect((await rejects(loadArtistOptions(client))).status).toBe(503)
  })
})

describe('loadEventCreate', () => {
  it('com "criar eventos": novo identificador de solicitação e artistas públicos (consulta anônima)', async () => {
    const user = fakeClient({ get_collective_access: ok(access(['create_events'])) })
    const anonymous = fakeClient({}, ok(artistRows))
    const data = await loadEventCreate(user.client, anonymous.client, C, () => REQUEST_ID)
    expect(data).toEqual({ requestId: REQUEST_ID, artistas: [{ id: ARTIST, nome: 'Artista sintético público' }] })
    expect(user.rpc).toHaveBeenCalledWith('get_collective_access', { target: C })
    // A lista pública nunca vem do cliente do titular (RLS mostraria atuações não publicadas).
    expect(user.from).not.toHaveBeenCalled()
    expect(anonymous.from).toHaveBeenCalledWith('profiles')
  })

  it('gera um identificador diferente a cada carregamento', async () => {
    const make = () => fakeClient({ get_collective_access: ok(access(['create_events'])) })
    const first = await loadEventCreate(make().client, fakeClient({}).client, C)
    const second = await loadEventCreate(make().client, fakeClient({}).client, C)
    expect(first.requestId).toMatch(/^[0-9a-f-]{36}$/)
    expect(first.requestId).not.toBe(second.requestId)
  })

  it('sem "criar eventos" (mesmo com outras permissões de evento): 403 e nenhuma consulta de artistas', async () => {
    const user = fakeClient({ get_collective_access: ok(access(['edit_events', 'publish_events'])) })
    const anonymous = fakeClient({}, ok(artistRows))
    const error = await rejects(loadEventCreate(user.client, anonymous.client, C))
    expect(error).toMatchObject({ status: 403, message: 'Você não tem permissão para criar eventos neste coletivo.' })
    expect(anonymous.from).not.toHaveBeenCalled()
  })

  it('o proprietário tem todas as permissões', async () => {
    const user = fakeClient({ get_collective_access: ok(access(['create_events'], true)) })
    expect((await loadEventCreate(user.client, fakeClient({}).client, C)).artistas).toEqual([])
  })

  it('coletivo não aprovado (sem acesso): 403; id inválido: 404; falha do banco: 503', async () => {
    expect((await rejects(loadEventCreate(fakeClient({ get_collective_access: ok(null) }).client, fakeClient({}).client, C))).status).toBe(403)
    expect((await rejects(loadEventCreate(fakeClient({}).client, fakeClient({}).client, 'x'))).status).toBe(404)
    expect((await rejects(loadEventCreate(fakeClient({ get_collective_access: failure }).client, fakeClient({}).client, C))).status).toBe(503)
  })
})

describe('loadEventManage', () => {
  const manage = (permissions: string[], row: Result = ok(eventRow()), artists: Result = ok(artistRows), owner = false) => {
    const user = fakeClient({ get_collective_access: ok(access(permissions, owner)), get_event: row })
    const anonymous = fakeClient({}, artists)
    return { user, anonymous, run: (id = C, eventId = E) => loadEventManage(user.client, anonymous.client, id, eventId) }
  }

  it('lê o evento pelo get_event e devolve campos editáveis, versão e lineup', async () => {
    const { user, run } = manage(['edit_events'])
    const data = await run()
    expect(user.rpc).toHaveBeenCalledWith('get_event', { target: E })
    expect(data.evento).toMatchObject({
      id: E,
      coletivoId: C,
      situacao: 'draft',
      versao: 3,
      nome: 'Evento sintético 5',
      descricao: '# Olá',
      ingressoLink: 'https://tickets.example.invalid/e',
      capa: '',
      lineup: [{ artistaId: ARTIST, nome: 'Artista sintético público' }, { nome: 'Convidada livre' }],
    })
    expect(data.artistas).toEqual([{ id: ARTIST, nome: 'Artista sintético público' }])
  })

  it('rascunho: editar exige "editar eventos"; publicar, "publicar eventos"; cancelar, "cancelar eventos"', async () => {
    expect((await manage(['edit_events']).run()).acoes).toEqual({ editar: true, publicar: false, cancelar: false })
    expect((await manage(['create_events']).run()).acoes).toEqual({ editar: false, publicar: false, cancelar: false })
    expect((await manage(['publish_events']).run()).acoes).toEqual({ editar: false, publicar: true, cancelar: false })
    expect((await manage(['cancel_events']).run()).acoes).toEqual({ editar: false, publicar: false, cancelar: true })
  })

  it('o proprietário recebe todas as permissões do banco e pode tudo no rascunho', async () => {
    const all = ['create_events', 'edit_events', 'publish_events', 'cancel_events']
    expect((await manage(all, ok(eventRow()), ok([]), true).run()).acoes).toEqual({ editar: true, publicar: true, cancelar: true })
  })

  it('publicado: editar exige também "publicar eventos"; já publicado não se publica de novo', async () => {
    const published = ok(eventRow({ state: 'published', first_published_at: '2030-01-01T00:00:00+00:00' }))
    expect((await manage(['edit_events'], published).run()).acoes).toEqual({ editar: false, publicar: false, cancelar: false })
    expect((await manage(['edit_events', 'publish_events', 'cancel_events'], published).run()).acoes).toEqual({ editar: true, publicar: false, cancelar: true })
  })

  it('cancelado: nada a fazer', async () => {
    const cancelled = ok(eventRow({ state: 'cancelled' }))
    const data = await manage(['edit_events', 'publish_events', 'cancel_events', 'create_events'], cancelled).run()
    expect(data.evento.situacao).toBe('cancelled')
    expect(data.acoes).toEqual({ editar: false, publicar: false, cancelar: false })
  })

  it('só consulta os artistas quando a pessoa pode editar', async () => {
    const readOnly = manage(['cancel_events'])
    expect((await readOnly.run()).artistas).toEqual([])
    expect(readOnly.anonymous.from).not.toHaveBeenCalled()
  })

  it('sem nenhuma permissão de evento: 403, sem consultar o evento', async () => {
    const { user, run } = manage(['manage_requests', 'read_messages'])
    expect(await rejects(run())).toMatchObject({ status: 403, message: 'Você não tem permissão para gerir eventos neste coletivo.' })
    expect(user.rpc).not.toHaveBeenCalledWith('get_event', expect.anything())
  })

  it('evento inexistente, invisível ou de outro coletivo: o mesmo 404', async () => {
    expect((await rejects(manage(['edit_events'], ok(null)).run())).status).toBe(404)
    expect((await rejects(manage(['edit_events'], ok(eventRow({ collective_id: OTHER }))).run())).status).toBe(404)
    expect((await rejects(manage(['edit_events']).run(C, 'não-uuid'))).status).toBe(404)
    expect((await rejects(manage(['edit_events']).run('x'))).status).toBe(404)
  })

  it('coletivo sem acesso (não aprovado): 403; falha do banco: 503; resposta malformada falha alto', async () => {
    const blocked = fakeClient({ get_collective_access: ok(null) })
    expect((await rejects(loadEventManage(blocked.client, fakeClient({}).client, C, E))).status).toBe(403)
    expect((await rejects(manage(['edit_events'], failure).run())).status).toBe(503)
    expect((await rejects(manage(['edit_events'], ok(eventRow({ version: 0 }))).run())).message).toBeTruthy()
  })
})

describe('mapManagedEvent', () => {
  it('capa informada, "outros" com descrição do tipo e fim preservados; reagendamento marcado', () => {
    const event = mapManagedEvent(
      eventRow({
        kind: 'outros',
        other_kind: 'Sarau',
        ends_at: '2030-05-11T05:00:00+00:00',
        cover_url: 'https://img.example.invalid/c.jpg',
        is_free: true,
        ticket_url: null,
        rescheduled_at: '2030-04-01T12:00:00+00:00',
      }),
    )
    expect(event).toMatchObject({
      tipo: 'outros',
      tipoOutro: 'Sarau',
      fim: '2030-05-11T05:00:00.000Z',
      capa: 'https://img.example.invalid/c.jpg',
      gratuito: true,
      ingressoLink: '',
      reagendadoEm: '2030-04-01T12:00:00.000Z',
    })
  })

  it('linha malformada falha em vez de mostrar dados parciais', () => {
    expect(() => mapManagedEvent(null)).toThrow()
    expect(() => mapManagedEvent(eventRow({ version: 'x' }))).toThrow()
    expect(() => mapManagedEvent(eventRow({ version: 1.5 }))).toThrow()
    expect(() => mapManagedEvent(eventRow({ state: 'archived' }))).toThrow()
    expect(() => mapManagedEvent(eventRow({ lineup: null }))).toThrow()
    expect(() => mapManagedEvent(eventRow({ rescheduled_at: 'ontem' }))).toThrow()
  })

  it('mapArtistOptions valida as linhas', () => {
    expect(mapArtistOptions([{ id: ARTIST, name: 'A' }])).toEqual([{ id: ARTIST, nome: 'A' }])
    expect(() => mapArtistOptions(null)).toThrow()
    expect(() => mapArtistOptions([{ id: ARTIST }])).toThrow()
  })
})
