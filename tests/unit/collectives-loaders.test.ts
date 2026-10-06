// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import { loadCollectiveList, loadCollectivePage } from '../../src/server/collectives.server'
import { HttpError, type SupabaseServerClient } from '../../src/server/supabase.server'

const collectiveRow = (n: number, extra = {}) => ({
  id: `05000000-0000-4000-8000-00000000000${n}`,
  kind: 'collective',
  name: `Organização sintética ${n}`,
  description: 'Fixture sem dados reais',
  activity: 'Música',
  city: 'Recife',
  state_code: 'PE',
  social_links: {},
  color: null,
  image_path: null,
  ...extra,
})

const NOW = Date.parse('2026-10-06T15:00:00Z')
const eventRow = (n: number, startsAt: string, endsAt: string | null = null) => ({
  id: `0a000000-0000-4000-8000-00000000000${n}`,
  collective_id: collectiveRow(1).id,
  name: `Evento sintético ${n}`,
  kind: 'festa',
  other_kind: null,
  starts_at: startsAt,
  ends_at: endsAt,
  state_code: 'PE',
  city: 'Recife',
  venue: 'Local sintético',
  is_free: true,
  ticket_url: null,
  cover_url: null,
})

type Result = { data: unknown; error: unknown }
const ok = (data: unknown): Result => ({ data, error: null })
const failure: Result = { data: null, error: { message: 'boom', code: 'PGRST000' } }

/** Query builder fake: records every chained call and resolves (thenable or `maybeSingle`) to the table's result. */
function fakeClient(tables: { collectives?: Result; events?: Result }, members: Result = ok([])) {
  const calls: { table: string; method: string; args: unknown[] }[] = []
  const from = vi.fn((table: string) => {
    const result = tables[table as 'collectives' | 'events']
    if (!result) throw new Error(`tabela inesperada: ${table}`)
    const builder: Record<string, unknown> = {
      then: (resolve: (value: Result) => unknown, reject: (reason: unknown) => unknown) =>
        Promise.resolve(result).then(resolve, reject),
      maybeSingle: async () => {
        calls.push({ table, method: 'maybeSingle', args: [] })
        return result
      },
    }
    for (const method of ['select', 'eq', 'order', 'limit']) {
      builder[method] = (...args: unknown[]) => {
        calls.push({ table, method, args })
        return builder
      }
    }
    return builder
  })
  const rpc = vi.fn(async (name: string) => {
    if (name !== 'get_collective_members') throw new Error(`rpc inesperado: ${name}`)
    return members
  })
  return { client: { from, rpc } as unknown as SupabaseServerClient, calls, rpc }
}

describe('loadCollectiveList', () => {
  it('traz os coletivos na ordem do banco, só com colunas liberadas ao anon', async () => {
    const { client, calls } = fakeClient({ collectives: ok([collectiveRow(1), collectiveRow(6, { kind: 'producer' })]) })
    const { coletivos } = await loadCollectiveList(client)
    expect(coletivos.map((c) => [c.nome, c.tipo])).toEqual([
      ['Organização sintética 1', 'coletivo'],
      ['Organização sintética 6', 'produtora'],
    ])
    const select = calls.find((c) => c.method === 'select')!
    expect(select.args[0]).toBe('id,kind,name,description,activity,city,state_code,social_links,color,image_path')
    expect(String(select.args[0])).not.toMatch(/\bstate\b|owner_user_id/)
  })

  it('lista vazia é um resultado válido', async () => {
    expect(await loadCollectiveList(fakeClient({ collectives: ok([]) }).client)).toEqual({ coletivos: [] })
  })

  it('erro do banco vira 503 e nunca uma lista vazia', async () => {
    await expect(loadCollectiveList(fakeClient({ collectives: failure }).client)).rejects.toMatchObject({ status: 503 })
  })

  it('resposta malformada falha em vez de ser descartada', async () => {
    await expect(loadCollectiveList(fakeClient({ collectives: ok({}) }).client)).rejects.toThrow('Resposta inválida')
  })
})

describe('loadCollectivePage', () => {
  const id = collectiveRow(1).id
  const events = [
    eventRow(6, '2026-10-12T15:00:00+00:00'), // futuro distante
    eventRow(1, '2026-10-07T15:00:00+00:00'), // futuro próximo
    eventRow(2, '2026-10-06T14:00:00+00:00', '2026-10-06T16:00:00+00:00'), // em andamento
    eventRow(3, '2026-09-29T15:00:00+00:00'), // passado
    eventRow(4, '2026-09-01T15:00:00+00:00'), // passado mais antigo
  ]
  const members = ok([
    { name: 'Pessoa A', artist_profile_id: '02000000-0000-4000-8000-000000000001' },
    { name: 'Pessoa B', artist_profile_id: null },
  ])

  it('carrega coletivo, membros e eventos separados em próximos (em andamento incluído) e anteriores', async () => {
    const { client, calls, rpc } = fakeClient({ collectives: ok(collectiveRow(1)), events: ok(events) }, members)
    const page = await loadCollectivePage(client, id, NOW)
    expect(page.coletivo.nome).toBe('Organização sintética 1')
    expect(page.membros).toEqual([{ nome: 'Pessoa A', artistaId: '02000000-0000-4000-8000-000000000001' }, { nome: 'Pessoa B' }])
    expect(page.proximos.map((e) => e.nome)).toEqual(['Evento sintético 2', 'Evento sintético 1', 'Evento sintético 6'])
    expect(page.anteriores.map((e) => e.nome)).toEqual(['Evento sintético 3', 'Evento sintético 4'])
    expect(rpc).toHaveBeenCalledWith('get_collective_members', { target: id })
    const eventCalls = calls.filter((c) => c.table === 'events')
    expect(eventCalls).toContainEqual({ table: 'events', method: 'eq', args: ['collective_id', id] })
    expect(eventCalls).toContainEqual({ table: 'events', method: 'eq', args: ['state', 'published'] })
    expect(calls).toContainEqual({ table: 'collectives', method: 'eq', args: ['id', id] })
  })

  it('evento sem fim continua em andamento até o fim do dia em Fortaleza', async () => {
    const sameDay = eventRow(5, '2026-10-06T03:30:00+00:00') // 00:30 em Fortaleza, mesmo dia de NOW
    const { client } = fakeClient({ collectives: ok(collectiveRow(1)), events: ok([sameDay]) })
    const page = await loadCollectivePage(client, id, NOW)
    expect(page.proximos).toHaveLength(1)
    expect(page.anteriores).toHaveLength(0)
  })

  it('limita os eventos anteriores exibidos aos 10 mais recentes', async () => {
    const past = Array.from({ length: 12 }, (_, i) => eventRow(i % 10, `2026-09-${String(20 - i).padStart(2, '0')}T15:00:00+00:00`))
    const { client } = fakeClient({ collectives: ok(collectiveRow(1)), events: ok(past) })
    const page = await loadCollectivePage(client, id, NOW)
    expect(page.anteriores).toHaveLength(10)
    expect(page.anteriores[0].inicio).toBe('2026-09-20T15:00:00.000Z')
  })

  it('sem eventos nem membros devolve listas vazias', async () => {
    const { client } = fakeClient({ collectives: ok(collectiveRow(1)), events: ok([]) })
    expect(await loadCollectivePage(client, id, NOW)).toMatchObject({ membros: [], proximos: [], anteriores: [] })
  })

  it('UUID inválido é 404 sem consultar o banco', async () => {
    const { client, rpc } = fakeClient({})
    const error = await loadCollectivePage(client, 'col-litoral').catch((e: unknown) => e)
    expect(error).toBeInstanceOf(HttpError)
    expect(error).toMatchObject({ status: 404, message: 'Coletivo não encontrado.' })
    expect(client.from).not.toHaveBeenCalled()
    expect(rpc).not.toHaveBeenCalled()
  })

  it('coletivo invisível (null: pendente, suspenso ou inexistente) é 404 sem buscar membros e eventos', async () => {
    const { client, rpc } = fakeClient({ collectives: ok(null) })
    await expect(loadCollectivePage(client, id, NOW)).rejects.toMatchObject({ status: 404 })
    expect(rpc).not.toHaveBeenCalled()
    expect(client.from).toHaveBeenCalledTimes(1)
  })

  it.each([
    ['coletivo', { collectives: failure, events: ok([]) }, members],
    ['eventos', { collectives: ok(collectiveRow(1)), events: failure }, members],
    ['membros', { collectives: ok(collectiveRow(1)), events: ok([]) }, failure],
  ])('erro ao consultar %s é 503', async (_label, tables, memberResult) => {
    await expect(loadCollectivePage(fakeClient(tables, memberResult).client, id, NOW)).rejects.toMatchObject({ status: 503 })
  })
})
