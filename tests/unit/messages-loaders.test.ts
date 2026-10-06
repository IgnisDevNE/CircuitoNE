// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import { loadMessages, loadNewMessage, MAX_THREAD_PAGES, threadPages } from '../../src/server/messages.server'
import type { SupabaseServerClient } from '../../src/server/supabase.server'

const ME = '02000000-0000-4000-8000-000000000001'
const OTHER = '02000000-0000-4000-8000-000000000007'
const C = '05000000-0000-4000-8000-000000000001'
const conv = (n: number) => `0d000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const msgId = (n: number) => `0e000000-0000-4000-8000-${String(n).padStart(12, '0')}`

type Result = { data: unknown; error: unknown }
const ok = (data: unknown): Result => ({ data, error: null })
type Rpc = Result | ((args: Record<string, unknown>) => Result)

const label = (kind: string, id: string, name: string) => ({ kind, id, name })
const profileRow = (id: string, name: string) => ({ id, kind: 'member', name, city: 'Recife', state_code: 'PE', published: false, is_default: false })
const conversation = (n: number, extra = {}) => ({
  id: conv(n), updated_at: `2026-10-06T12:${String(59 - (n % 60)).padStart(2, '0')}:00.000001+00:00`,
  side_a: label('profile', ME, 'Minha atuação'), side_b: label('profile', OTHER, 'Interlocutor'),
  blocked: false, archived: false, unread_count: 0, ...extra,
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
const status = async (promise: Promise<unknown>) => {
  try {
    await promise
  } catch (error) {
    return error as { status: number; message: string }
  }
  throw new Error('deveria falhar')
}

describe('loadMessages (conta)', () => {
  const base = (extra: Record<string, Rpc> = {}) =>
    fakeClient({
      list_my_profiles: ok([profileRow(ME, 'Minha atuação')]),
      list_conversations: ok([conversation(1, { unread_count: 2 }), conversation(2, { side_a: label('profile', 'outro', 'Outra pessoa'), side_b: label('profile', 'terceiro', 'Terceiro') })]),
      get_conversation_details: ok([detail(1)]),
      ...extra,
    })

  it('lista só as conversas em que uma atuação do titular é ponta, com prévia e não lidas', async () => {
    const { client, rpc } = base()
    const result = await loadMessages(client, { kind: 'account' })
    expect(result.conversas.map((c) => [c.id, c.titulo, c.naoLidas])).toEqual([[conv(1), 'Interlocutor', 2]])
    expect(result.conversas[0].ultima?.texto).toBe('Mensagem 1')
    expect(result).toMatchObject({ aberta: null, limitada: false, podeEnviar: true })
    expect(calls(rpc, 'get_conversation_details')).toEqual([{ targets: [conv(1)] }])
    expect(calls(rpc, 'get_recent_messages')).toEqual([])
  })

  it('pagina list_conversations pelo cursor original até a última página', async () => {
    const page = Array.from({ length: 50 }, (_, i) => conversation(i + 1))
    const seen: Record<string, unknown>[] = []
    const { client } = base({
      list_conversations: (args) => {
        seen.push(args)
        return ok(Object.keys(args).length === 0 ? page : [conversation(51)])
      },
      get_conversation_details: ok([]),
    })
    const result = await loadMessages(client, { kind: 'account' })
    expect(seen).toEqual([{}, { after_time: page[49].updated_at, after_id: page[49].id }])
    expect(result.conversas).toHaveLength(50)
    expect(result.limitada).toBe(true)
  })

  it('abre a conversa com as mensagens em ordem e informa que há anteriores', async () => {
    const full = Array.from({ length: 50 }, (_, i) => message(i + 11))
    const { client, rpc } = base({ get_recent_messages: ok(full) })
    const result = await loadMessages(client, { kind: 'account' }, { conversationId: conv(1) })
    expect(result.aberta?.mensagens).toHaveLength(50)
    expect(result.aberta).toMatchObject({ maisAnteriores: true, paginas: 1 })
    expect(result.aberta?.conversa.id).toBe(conv(1))
    expect(calls(rpc, 'get_recent_messages')).toEqual([{ target: conv(1) }])
  })

  it('páginas extras usam o cursor da mensagem mais antiga carregada e vêm antes das recentes', async () => {
    const recent = Array.from({ length: 50 }, (_, i) => message(i + 11))
    const older = Array.from({ length: 10 }, (_, i) => message(i + 1))
    const { client, rpc } = base({ get_recent_messages: (args) => ok(args.before_id ? older : recent) })
    const result = await loadMessages(client, { kind: 'account' }, { conversationId: conv(1), pages: 2 })
    expect(calls(rpc, 'get_recent_messages')[1]).toEqual({ target: conv(1), before_time: recent[0].created_at, before_id: recent[0].id })
    expect(result.aberta?.mensagens.map((m) => m.texto)[0]).toBe('Mensagem 1')
    expect(result.aberta?.mensagens).toHaveLength(60)
    expect(result.aberta).toMatchObject({ maisAnteriores: false, paginas: 2 })
    // O cursor guarda o texto original: sem perder os microssegundos que um Date descartaria.
    expect(result.aberta?.mensagens[10].cursor).toBe(recent[0].created_at)
  })

  it('limita o número de páginas pedido', async () => {
    const full = Array.from({ length: 50 }, (_, i) => message(i + 1))
    const { client, rpc } = base({ get_recent_messages: ok(full) })
    const result = await loadMessages(client, { kind: 'account' }, { conversationId: conv(1), pages: 99 })
    expect(calls(rpc, 'get_recent_messages')).toHaveLength(MAX_THREAD_PAGES)
    expect(result.aberta?.maisAnteriores).toBe(false)
    expect(threadPages(new Request('https://x.test/painel/mensagens/a?paginas=3'))).toBe(3)
    expect(threadPages(new Request('https://x.test/a?paginas=999'))).toBe(MAX_THREAD_PAGES)
    for (const bad of ['0', '-1', 'abc', '1.5', '']) expect(threadPages(new Request(`https://x.test/a?paginas=${bad}`))).toBe(1)
    expect(threadPages(new Request('https://x.test/a'))).toBe(1)
  })

  it('conversa inexistente, alheia ou com id inválido responde 404 igual', async () => {
    for (const id of [conv(2), conv(9), 'qualquer-coisa']) {
      const { client } = base()
      const failure = await status(loadMessages(client, { kind: 'account' }, { conversationId: id }))
      expect(failure).toMatchObject({ status: 404, message: 'Conversa não encontrada.' })
    }
  })

  it('banco indisponível vira 503, nunca lista vazia', async () => {
    const { client } = base({ list_conversations: { data: null, error: { message: 'boom' } } })
    expect(await status(loadMessages(client, { kind: 'account' }))).toMatchObject({ status: 503 })
  })

  it('conversa fora das 50 primeiras ainda abre (detalhes próprios)', async () => {
    const page = Array.from({ length: 50 }, (_, i) => conversation(i + 1))
    const { client, rpc } = base({
      list_conversations: (args) => ok(Object.keys(args).length === 0 ? page : [conversation(51)]),
      get_conversation_details: ok([]),
      get_recent_messages: ok([message(1)]),
    })
    const result = await loadMessages(client, { kind: 'account' }, { conversationId: conv(51) })
    expect(result.aberta?.conversa.id).toBe(conv(51))
    expect(calls(rpc, 'get_conversation_details')[1]).toEqual({ targets: [conv(51)] })
  })
})

describe('loadMessages (coletivo)', () => {
  const side = (extra = {}) => conversation(1, { side_a: label('collective', C, 'Organização 1'), side_b: label('profile', OTHER, 'Interlocutor'), ...extra })
  const collective = (permissions: string[]) =>
    fakeClient({
      get_collective_access: ok({ owner: false, role_id: 'r', permissions }),
      list_conversations: ok([side(), conversation(2)]),
      get_conversation_details: ok([detail(1)]),
      get_recent_messages: ok([message(1)]),
    })

  it('sem "ler mensagens" o acesso é negado (403), mesmo que o menu estivesse escondido', async () => {
    const { client, rpc } = collective(['send_messages'])
    expect(await status(loadMessages(client, { kind: 'collective', id: C }))).toMatchObject({ status: 403 })
    expect(calls(rpc, 'list_conversations')).toEqual([])
  })

  it('lê as conversas do coletivo; sem "enviar mensagens" o titular não pode enviar', async () => {
    const reader = await loadMessages(collective(['read_messages']).client, { kind: 'collective', id: C }, { conversationId: conv(1) })
    expect(reader.conversas.map((c) => c.id)).toEqual([conv(1)])
    expect(reader.podeEnviar).toBe(false)
    expect(reader.aberta?.conversa.remetentes[0].de).toMatchObject({ kind: 'collective', id: C })
    const sender = await loadMessages(collective(['read_messages', 'send_messages']).client, { kind: 'collective', id: C })
    expect(sender.podeEnviar).toBe(true)
  })

  it('não-membro (sem acesso efetivo) e id inválido não chegam às conversas', async () => {
    const none = fakeClient({ get_collective_access: ok(null) })
    expect(await status(loadMessages(none.client, { kind: 'collective', id: C }))).toMatchObject({ status: 403 })
    expect(await status(loadMessages(none.client, { kind: 'collective', id: 'x' }))).toMatchObject({ status: 404 })
  })
})

describe('loadNewMessage', () => {
  const rpcs = {
    list_my_profiles: ok([profileRow(ME, 'Minha atuação'), profileRow(OTHER, 'Outro projeto meu')]),
    list_my_collectives: ok([
      { id: C, kind: 'collective', name: 'Organização 1', city: 'Recife', state_code: 'PE', state: 'approved', role_name: 'Produção', is_owner: false },
      { id: '05000000-0000-4000-8000-000000000002', kind: 'collective', name: 'Pendente', city: 'Recife', state_code: 'PE', state: 'pending', role_name: 'Membro', is_owner: true },
    ]),
    get_collective_access: ok({ owner: false, role_id: 'r', permissions: ['read_messages', 'send_messages'] }),
  }
  const target = '02000000-0000-4000-8000-000000000099'

  it('oferece minhas atuações e coletivos que leem e enviam, exceto o próprio destinatário', async () => {
    const { client } = fakeClient(rpcs, { profiles: ok({ id: target, name: 'Artista público' }) })
    const result = await loadNewMessage(client, `profile:${target}`)
    expect(result.destinatario).toEqual({ kind: 'profile', id: target, nome: 'Artista público' })
    expect(result.remetentes.map((r) => [r.kind, r.nome])).toEqual([['profile', 'Minha atuação'], ['profile', 'Outro projeto meu'], ['collective', 'Organização 1']])
    const self = await loadNewMessage(fakeClient(rpcs, { profiles: ok({ id: ME, name: 'Minha atuação' }) }).client, `profile:${ME}`)
    expect(self.remetentes.map((r) => r.nome)).toEqual(['Outro projeto meu', 'Organização 1'])
  })

  it('coletivo sem as duas permissões não aparece como remetente', async () => {
    const limited = { ...rpcs, get_collective_access: ok({ owner: false, role_id: 'r', permissions: ['read_messages'] }) }
    const { client } = fakeClient(limited, { collectives: ok({ id: C, name: 'Destino' }) })
    const result = await loadNewMessage(client, `collective:${'05000000-0000-4000-8000-000000000006'}`)
    expect(result.remetentes.map((r) => r.kind)).toEqual(['profile', 'profile'])
  })

  it('destinatário inválido ou invisível responde 404', async () => {
    for (const para of [null, 'profile:x', `user:${target}`]) {
      expect(await status(loadNewMessage(fakeClient(rpcs).client, para))).toMatchObject({ status: 404 })
    }
    const { client } = fakeClient(rpcs, { profiles: ok(null) })
    expect(await status(loadNewMessage(client, `profile:${target}`))).toMatchObject({ status: 404, message: 'Interlocutor não encontrado.' })
  })
})
