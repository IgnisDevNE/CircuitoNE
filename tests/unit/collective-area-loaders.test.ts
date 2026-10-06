// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import {
  loadCollectiveArea,
  loadCollectiveDashboard,
  loadCollectiveRequests,
  loadMyCollectivesPage,
} from '../../src/server/collective-area.server'
import { DEFAULT_ACCENT } from '../../src/server/mappers/collectives'
import type { SupabaseServerClient } from '../../src/server/supabase.server'

const C = '05000000-0000-4000-8000-000000000001'
const NOW = Date.parse('2026-10-06T15:00:00Z')

type Result = { data: unknown; error: unknown }
const ok = (data: unknown): Result => ({ data, error: null })
const failure: Result = { data: null, error: { message: 'boom', code: 'PGRST000' } }

const mine = (extra = {}) => ({
  id: C, kind: 'collective', name: 'Organização sintética 1', city: 'Recife', state_code: 'PE',
  state: 'approved', role_name: 'Membro', is_owner: false, ...extra,
})
const access = (permissions: string[], owner = false) => ({ owner, role_id: 'r', permissions })
const requestRow = (n: number) => ({
  id: `09000000-0000-4000-8000-00000000000${n}`, created_at: `2026-10-0${n}T12:00:00+00:00`, message: `Mensagem ${n}`,
  requester_name: `Pessoa ${n}`, profile_id: null, profile_name: null, profile_kind: null, profile_published: null,
})
const managed = (n: number, state = 'published', startsAt = `2026-10-1${n}T15:00:00+00:00`) => ({
  id: `0a000000-0000-4000-8000-00000000000${n}`, name: `Evento ${n}`, state, starts_at: startsAt, ends_at: null, version: 1,
})
const publicEvent = (n: number, startsAt: string, endsAt: string | null = null) => ({
  id: `0a000000-0000-4000-8000-00000000000${n}`, collective_id: C, name: `Evento público ${n}`, kind: 'festa', other_kind: null,
  starts_at: startsAt, ends_at: endsAt, state_code: 'PE', city: 'Recife', venue: 'Local', is_free: true, ticket_url: null, cover_url: null,
})
const catalogRow = (n: number, extra = {}) => ({
  id: `05000000-0000-4000-8000-00000000000${n}`, kind: 'collective', name: `Organização sintética ${n}`, description: 'Fixture',
  activity: 'Música', city: 'Recife', state_code: 'PE', social_links: {}, color: null, image_path: null, ...extra,
})

type Rpc = Result | ((args: Record<string, unknown>) => Result)

/** RPCs por nome e tabelas por nome; qualquer chamada fora da tabela é um erro de teste. */
function fakeClient(rpcs: Record<string, Rpc>, tables: Record<string, Result> = {}) {
  const rpc = vi.fn(async (name: string, args: Record<string, unknown> = {}) => {
    const entry = rpcs[name]
    if (!entry) throw new Error(`rpc inesperado: ${name}`)
    return typeof entry === 'function' ? entry(args) : entry
  })
  const calls: { table: string; method: string; args: unknown[] }[] = []
  const from = vi.fn((table: string) => {
    const result = tables[table]
    if (!result) throw new Error(`tabela inesperada: ${table}`)
    const builder: Record<string, unknown> = {
      then: (resolve: (value: Result) => unknown, reject: (reason: unknown) => unknown) => Promise.resolve(result).then(resolve, reject),
      maybeSingle: async () => result,
    }
    for (const method of ['select', 'eq', 'order', 'limit']) {
      builder[method] = (...args: unknown[]) => {
        calls.push({ table, method, args })
        return builder
      }
    }
    return builder
  })
  return { client: { rpc, from } as unknown as SupabaseServerClient, rpc, calls }
}
const names = (spy: ReturnType<typeof vi.fn>) => spy.mock.calls.map(([name]) => name as string)

describe('loadCollectiveArea', () => {
  const approved = (permissions: string[], extra: { owner?: boolean; color?: string | null; requests?: Result } = {}) =>
    fakeClient(
      {
        list_my_collectives: ok([mine({ is_owner: !!extra.owner })]),
        get_collective_access: ok(access(permissions, extra.owner)),
        list_collective_requests: extra.requests ?? ok([]),
      },
      { collectives: ok({ id: C, color: extra.color === undefined ? '#8b5cf6' : extra.color }) },
    )

  it('id que não é UUID ou coletivo de que o titular não é membro: 404 igual, sem revelar existência', async () => {
    const invalid = fakeClient({})
    await expect(loadCollectiveArea(invalid.client, 'col-litoral')).rejects.toMatchObject({ status: 404 })
    expect(invalid.rpc).not.toHaveBeenCalled()
    const other = fakeClient({ list_my_collectives: ok([mine({ id: '05000000-0000-4000-8000-000000000002' })]) })
    await expect(loadCollectiveArea(other.client, C)).rejects.toMatchObject({ status: 404 })
    const unknown = fakeClient({ list_my_collectives: ok([]) })
    await expect(loadCollectiveArea(unknown.client, C)).rejects.toMatchObject({ status: 404 })
    expect(names(unknown.rpc)).toEqual(['list_my_collectives'])
  })

  it('coletivo aprovado: permissões efetivas, cor e cargo do titular; sem gerir pedidos não consulta a fila', async () => {
    const { client, rpc } = approved(['read_messages'])
    expect(await loadCollectiveArea(client, C)).toEqual({
      status: 'available',
      coletivo: { id: C, nome: 'Organização sintética 1', tipo: 'coletivo', cidade: 'Recife', estado: 'PE', cargo: 'Membro', dono: false, cor: '#8b5cf6' },
      permissoes: ['read_messages'],
      pendentes: null,
    })
    expect(names(rpc)).not.toContain('list_collective_requests')
  })

  it('quem gere pedidos recebe a quantidade de pendentes; proprietário vem com todas as permissões', async () => {
    const manager = approved(['manage_requests'], { requests: ok([requestRow(1), requestRow(2)]) })
    expect(await loadCollectiveArea(manager.client, C)).toMatchObject({ status: 'available', pendentes: 2 })
    const owner = approved(['manage_requests', 'create_events'], { owner: true })
    expect(await loadCollectiveArea(owner.client, C)).toMatchObject({ coletivo: { dono: true }, pendentes: 0 })
  })

  it('cor ausente ou fora do formato usa o destaque padrão', async () => {
    for (const color of [null, 'vermelho']) {
      const { client } = approved([], { color })
      expect(await loadCollectiveArea(client, C)).toMatchObject({ coletivo: { cor: DEFAULT_ACCENT } })
    }
  })

  it('sem acesso efetivo (banco devolve nulo) vira 404', async () => {
    const { client } = fakeClient(
      { list_my_collectives: ok([mine()]), get_collective_access: ok(null) },
      { collectives: ok({ id: C, color: null }) },
    )
    await expect(loadCollectiveArea(client, C)).rejects.toMatchObject({ status: 404 })
  })

  it('coletivo encerrado nunca aparece (404) mesmo que a lista o devolva', async () => {
    const { client } = fakeClient({ list_my_collectives: ok([mine({ state: 'closed' })]) })
    await expect(loadCollectiveArea(client, C)).rejects.toMatchObject({ status: 404 })
  })

  it.each(['pending', 'rejected', 'suspended'] as const)('coletivo %s: só o estado, sem permissões nem funções internas', async (state) => {
    const { client, rpc } = fakeClient({ list_my_collectives: ok([mine({ state })]) })
    expect(await loadCollectiveArea(client, C)).toEqual({
      status: 'unavailable',
      coletivo: expect.objectContaining({ id: C, nome: 'Organização sintética 1', cor: DEFAULT_ACCENT }),
      situacao: state,
      motivo: null,
    })
    expect(names(rpc)).toEqual(['list_my_collectives'])
  })

  it('só o proprietário de coletivo não aprovado acompanha o motivo da decisão', async () => {
    const { client, rpc } = fakeClient({
      list_my_collectives: ok([mine({ state: 'rejected', is_owner: true })]),
      get_collective_status: ok({ id: C, state: 'rejected', reason: 'Sem contato com o responsável' }),
    })
    expect(await loadCollectiveArea(client, C)).toMatchObject({ status: 'unavailable', situacao: 'rejected', motivo: 'Sem contato com o responsável' })
    expect(rpc).toHaveBeenCalledWith('get_collective_status', { target: C })
  })

  it('erros do banco viram 503, nunca "não encontrado"', async () => {
    await expect(loadCollectiveArea(fakeClient({ list_my_collectives: failure }).client, C)).rejects.toMatchObject({ status: 503 })
    const noAccess = fakeClient({ list_my_collectives: ok([mine()]), get_collective_access: failure }, { collectives: ok({ id: C, color: null }) })
    await expect(loadCollectiveArea(noAccess.client, C)).rejects.toMatchObject({ status: 503 })
    const noQueue = approved(['manage_requests'], { requests: failure })
    await expect(loadCollectiveArea(noQueue.client, C)).rejects.toMatchObject({ status: 503 })
    const noColor = fakeClient({ list_my_collectives: ok([mine()]), get_collective_access: ok(access([])) }, { collectives: failure })
    await expect(loadCollectiveArea(noColor.client, C)).rejects.toMatchObject({ status: 503 })
  })
})

describe('loadCollectiveDashboard', () => {
  const byPeriod = (lists: Partial<Record<'ongoing' | 'future' | 'past', unknown[]>>): Rpc => (args) => ok(lists[args.period as 'ongoing'] ?? [])

  it('sem acesso efetivo (pendente, suspenso ou ex-membro): 403', async () => {
    const { client } = fakeClient({ get_collective_access: ok(null) })
    await expect(loadCollectiveDashboard(client, C, NOW)).rejects.toMatchObject({ status: 403 })
    await expect(loadCollectiveDashboard(fakeClient({}).client, 'x', NOW)).rejects.toMatchObject({ status: 404 })
  })

  it('com permissão de eventos: gestão em andamento, depois futuros por proximidade e só os 10 passados mais recentes', async () => {
    const past = Array.from({ length: 12 }, (_, i) => ({ ...managed(1, 'published', `2026-09-${String(30 - i).padStart(2, '0')}T15:00:00+00:00`), id: `p${i}`, name: `Passado ${i}` }))
    const { client, rpc } = fakeClient({
      get_collective_access: ok(access(['edit_events'])),
      list_collective_events: byPeriod({
        ongoing: [{ ...managed(2), id: 'o1', name: 'Agora' }],
        future: [managed(3, 'draft'), managed(4, 'cancelled')],
        past,
      }),
    })
    const result = await loadCollectiveDashboard(client, C, NOW)
    expect(result.gestao).toBe(true)
    expect(result.eventos.map((e) => [e.nome, e.situacao, e.periodo])).toEqual([
      ['Agora', 'published', 'ongoing'],
      ['Evento 3', 'draft', 'future'],
      ['Evento 4', 'cancelled', 'future'],
      ...past.slice(0, 10).map((e) => [e.name, 'published', 'past']),
    ])
    expect(rpc.mock.calls.filter(([name]) => name === 'list_collective_events').map(([, args]) => (args as { period: string }).period).sort()).toEqual(['future', 'ongoing', 'past'])
    expect(names(rpc)).not.toContain('list_conversations')
    expect(result.mensagens).toBeNull()
  })

  it('Membro sem permissão de eventos vê só os eventos publicados, próximos antes dos encerrados', async () => {
    const { client, rpc, calls } = fakeClient(
      { get_collective_access: ok(access([])) },
      {
        events: ok([
          publicEvent(3, '2026-10-20T15:00:00+00:00'),
          publicEvent(2, '2026-10-08T15:00:00+00:00'),
          publicEvent(1, '2026-10-06T10:00:00+00:00', '2026-10-06T20:00:00+00:00'),
          publicEvent(4, '2026-09-20T15:00:00+00:00'),
        ]),
      },
    )
    const result = await loadCollectiveDashboard(client, C, NOW)
    expect(result.gestao).toBe(false)
    expect(result.eventos.map((e) => [e.nome, e.periodo, e.situacao])).toEqual([
      ['Evento público 1', 'ongoing', 'published'],
      ['Evento público 2', 'future', 'published'],
      ['Evento público 3', 'future', 'published'],
      ['Evento público 4', 'past', 'published'],
    ])
    expect(names(rpc)).toEqual(['get_collective_access'])
    expect(calls.find((c) => c.method === 'eq' && c.args[0] === 'state')?.args[1]).toBe('published')
  })

  it('"ler mensagens" traz o resumo das conversas do coletivo, ignorando as pessoais', async () => {
    const { client } = fakeClient(
      {
        get_collective_access: ok(access(['read_messages'])),
        list_conversations: ok([
          { id: 'c1', unread_count: 2, side_a: { kind: 'profile', id: 'p' }, side_b: { kind: 'collective', id: C } },
          { id: 'c2', unread_count: 9, side_a: { kind: 'profile', id: 'p' }, side_b: { kind: 'profile', id: 'q' } },
        ]),
      },
      { events: ok([]) },
    )
    expect((await loadCollectiveDashboard(client, C, NOW)).mensagens).toEqual({ conversas: 1, naoLidas: 2 })
  })

  it('erros viram 503', async () => {
    const eventsFail = fakeClient({ get_collective_access: ok(access(['create_events'])), list_collective_events: failure })
    await expect(loadCollectiveDashboard(eventsFail.client, C, NOW)).rejects.toMatchObject({ status: 503 })
    const publicFail = fakeClient({ get_collective_access: ok(access([])) }, { events: failure })
    await expect(loadCollectiveDashboard(publicFail.client, C, NOW)).rejects.toMatchObject({ status: 503 })
    const chatFail = fakeClient({ get_collective_access: ok(access(['read_messages'])), list_conversations: failure }, { events: ok([]) })
    await expect(loadCollectiveDashboard(chatFail.client, C, NOW)).rejects.toMatchObject({ status: 503 })
    await expect(loadCollectiveDashboard(fakeClient({ get_collective_access: failure }).client, C, NOW)).rejects.toMatchObject({ status: 503 })
  })
})

describe('loadCollectiveRequests', () => {
  it('sem "gerir pedidos de entrada" responde 403 sem consultar a fila', async () => {
    const { client, rpc } = fakeClient({ get_collective_access: ok(access(['read_messages', 'create_events'])) })
    await expect(loadCollectiveRequests(client, C)).rejects.toMatchObject({ status: 403 })
    expect(names(rpc)).toEqual(['get_collective_access'])
  })

  it('sem acesso efetivo: 403; coletivo inexistente: 404', async () => {
    await expect(loadCollectiveRequests(fakeClient({ get_collective_access: ok(null) }).client, C)).rejects.toMatchObject({ status: 403 })
    await expect(loadCollectiveRequests(fakeClient({}).client, 'x')).rejects.toMatchObject({ status: 404 })
  })

  it('traz a fila mapeada, na ordem do banco', async () => {
    const { client, rpc } = fakeClient({ get_collective_access: ok(access(['manage_requests'])), list_collective_requests: ok([requestRow(1), requestRow(2)]) })
    const { pedidos } = await loadCollectiveRequests(client, C)
    expect(pedidos.map((p) => [p.nome, p.mensagem, p.atuacao])).toEqual([['Pessoa 1', 'Mensagem 1', null], ['Pessoa 2', 'Mensagem 2', null]])
    expect(rpc).toHaveBeenCalledWith('list_collective_requests', { target: C })
  })

  it('erro do banco vira 503', async () => {
    const { client } = fakeClient({ get_collective_access: ok(access(['manage_requests'])), list_collective_requests: failure })
    await expect(loadCollectiveRequests(client, C)).rejects.toMatchObject({ status: 503 })
  })
})

describe('loadMyCollectivesPage', () => {
  const myRequest = (id: string, collective: string, state: string, createdAt: string) => ({ id, collective_id: collective, state, created_at: createdAt })
  const profileRow = { id: 'p1', kind: 'artist', name: 'Artista sintético', city: 'Recife', state_code: 'PE', published: true, is_default: true }
  const c = (n: number) => `05000000-0000-4000-8000-00000000000${n}`

  it('une coletivos, perfis e pedidos; oferece só coletivos aprovados sem vínculo, marcando os com pedido pendente', async () => {
    const { client } = fakeClient(
      {
        list_my_collectives: ok([mine({ id: c(1) }), mine({ id: c(2), name: 'Em análise', state: 'pending' })]),
        list_my_profiles: ok([profileRow]),
        get_my_collective_requests: ok([
          myRequest('r1', c(3), 'cancelled', '2026-10-05T12:00:00+00:00'),
          myRequest('r2', c(6), 'pending', '2026-10-01T12:00:00+00:00'),
          myRequest('r3', c(1), 'approved', '2026-10-04T12:00:00+00:00'),
        ]),
      },
      { collectives: ok([catalogRow(1), catalogRow(3), catalogRow(6, { kind: 'producer' })]) },
    )
    const page = await loadMyCollectivesPage(client)
    expect(page.coletivos.map((x) => [x.nome, x.situacao])).toEqual([['Organização sintética 1', 'approved'], ['Em análise', 'pending']])
    expect(page.perfis).toEqual([expect.objectContaining({ id: 'p1', tipo: 'artista' })])
    // Pendente primeiro; depois do mais recente ao mais antigo.
    expect(page.pedidos.map((p) => [p.id, p.situacao, p.coletivoNome])).toEqual([
      ['r2', 'pending', 'Organização sintética 6'],
      ['r1', 'cancelled', 'Organização sintética 3'],
      ['r3', 'approved', 'Organização sintética 1'],
    ])
    expect(page.disponiveis).toEqual([
      { id: c(3), nome: 'Organização sintética 3', tipo: 'coletivo', cidade: 'Recife', estado: 'PE', pendente: false },
      { id: c(6), nome: 'Organização sintética 6', tipo: 'produtora', cidade: 'Recife', estado: 'PE', pendente: true },
    ])
  })

  it('pagina os pedidos pelo último id enquanto a página vier cheia', async () => {
    const full = Array.from({ length: 50 }, (_, i) => myRequest(`r${String(i).padStart(2, '0')}`, c(1), 'rejected', '2026-10-01T12:00:00+00:00'))
    const get = vi.fn((args: Record<string, unknown>) => (args.after_id ? ok([myRequest('r99', c(1), 'rejected', '2026-10-02T12:00:00+00:00')]) : ok(full)))
    const { client, rpc } = fakeClient(
      { list_my_collectives: ok([]), list_my_profiles: ok([]), get_my_collective_requests: get },
      { collectives: ok([catalogRow(1)]) },
    )
    const page = await loadMyCollectivesPage(client)
    expect(page.pedidos).toHaveLength(51)
    expect(rpc.mock.calls.filter(([name]) => name === 'get_my_collective_requests').map(([, args]) => args)).toEqual([{}, { after_id: 'r49' }])
  })

  it('sem nada: listas vazias; nome do coletivo ausente do catálogo fica nulo', async () => {
    const empty = fakeClient({ list_my_collectives: ok([]), list_my_profiles: ok([]), get_my_collective_requests: ok([]) }, { collectives: ok([]) })
    expect(await loadMyCollectivesPage(empty.client)).toEqual({ coletivos: [], perfis: [], pedidos: [], disponiveis: [] })
    const orphan = fakeClient(
      { list_my_collectives: ok([]), list_my_profiles: ok([]), get_my_collective_requests: ok([myRequest('r', c(9), 'pending', '2026-10-01T12:00:00+00:00')]) },
      { collectives: ok([]) },
    )
    expect((await loadMyCollectivesPage(orphan.client)).pedidos[0].coletivoNome).toBeNull()
  })

  it('qualquer erro vira 503', async () => {
    const base = { list_my_collectives: ok([]), list_my_profiles: ok([]), get_my_collective_requests: ok([]) }
    for (const broken of ['list_my_collectives', 'list_my_profiles', 'get_my_collective_requests'])
      await expect(loadMyCollectivesPage(fakeClient({ ...base, [broken]: failure }, { collectives: ok([]) }).client)).rejects.toMatchObject({ status: 503 })
    await expect(loadMyCollectivesPage(fakeClient(base, { collectives: failure }).client)).rejects.toMatchObject({ status: 503 })
  })
})
