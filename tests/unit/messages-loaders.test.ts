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
      list_my_collectives: ok([]),
      list_conversations: ok([conversation(1, { unread_count: 2 }), conversation(2, { side_a: label('profile', 'outro', 'Outra pessoa'), side_b: label('profile', 'terceiro', 'Terceiro') })]),
      get_conversation_details: ok([detail(1)]),
      ...extra,
    })

  it('lista só as conversas em que o titular é ponta (atuação ou coletivo que ele lê), com prévia e não lidas', async () => {
    const { client, rpc } = base()
    const result = await loadMessages(client, { kind: 'account' })
    expect(result.conversas.map((c) => [c.id, c.titulo, c.naoLidas])).toEqual([[conv(1), 'Interlocutor', 2]])
    expect(result.conversas[0].ultima?.texto).toBe('Mensagem 1')
    expect(result.conversas[0].meus).toEqual([{ kind: 'profile', id: ME, nome: 'Minha atuação' }])
    expect(result).toMatchObject({ aberta: null, limitada: false, podeEnviar: true })
    expect(calls(rpc, 'get_conversation_details')).toEqual([{ targets: [conv(1)] }])
    expect(calls(rpc, 'get_recent_messages')).toEqual([])
    // Sem coletivo nas conversas, nenhuma conferência de acesso é necessária.
    expect(calls(rpc, 'get_collective_access')).toEqual([])
  })

  describe('conversas de coletivos', () => {
    const COL = '05000000-0000-4000-8000-000000000003'
    const myCollective = (id: string, name: string, state = 'approved') => ({ id, kind: 'collective', name, city: 'Recife', state_code: 'PE', state, role_name: 'Produção', is_owner: false })
    const access = (permissions: string[]) => ({ owner: false, role_id: 'r', permissions })
    const rows = [
      conversation(1),
      conversation(2, { side_a: label('collective', C, 'Organização 1'), side_b: label('profile', OTHER, 'Interlocutor') }),
      conversation(3, { side_a: label('collective', COL, 'Organização 3'), side_b: label('profile', 'terceiro', 'Terceiro') }),
    ]
    const withCollectives = (permissions: Record<string, string[] | null>, mine = [myCollective(C, 'Organização 1'), myCollective(COL, 'Organização 3')]) =>
      base({
        list_my_collectives: ok(mine),
        list_conversations: ok(rows),
        get_conversation_details: ok([detail(1), detail(2)]),
        get_recent_messages: ok([message(1)]),
        get_collective_access: (args) => {
          const granted = permissions[args.target as string]
          return ok(granted ? access(granted) : null)
        },
      })

    it('a central mostra também as conversas dos coletivos que o titular lê, com a identidade de cada uma', async () => {
      const { client, rpc } = withCollectives({ [C]: ['read_messages', 'send_messages'], [COL]: ['read_messages'] })
      const result = await loadMessages(client, { kind: 'account' })
      expect(result.conversas.map((c) => [c.id, c.meus.map((m) => `${m.kind}:${m.nome}`)])).toEqual([
        [conv(1), ['profile:Minha atuação']],
        [conv(2), ['collective:Organização 1']],
        [conv(3), ['collective:Organização 3']],
      ])
      expect(result.conversas[1].titulo).toBe('Interlocutor')
      // Só os coletivos que aparecem nas conversas têm o acesso conferido.
      expect(calls(rpc, 'get_collective_access').map((args) => (args as { target: string }).target).sort()).toEqual([C, COL].sort())
    })

    it('enviar exige a permissão "enviar mensagens": só ler deixa a conversa sem remetente', async () => {
      const { client } = withCollectives({ [C]: ['read_messages', 'send_messages'], [COL]: ['read_messages'] })
      const result = await loadMessages(client, { kind: 'account' })
      expect(result.conversas.map((c) => c.remetentes.map((r) => `${r.de.kind}:${r.de.nome}>${r.para.nome}`))).toEqual([
        ['profile:Minha atuação>Interlocutor'],
        ['collective:Organização 1>Interlocutor'],
        [],
      ])
    })

    it('sem "ler mensagens" (ou sem acesso, ou coletivo que não é do titular) a conversa não aparece', async () => {
      const { client } = withCollectives({ [C]: ['send_messages'], [COL]: null })
      const result = await loadMessages(client, { kind: 'account' })
      expect(result.conversas.map((c) => c.id)).toEqual([conv(1)])
      // Coletivo pendente não é conferido: não há função de mensagens para ele.
      const pending = withCollectives({}, [myCollective(C, 'Organização 1', 'pending')])
      expect((await loadMessages(pending.client, { kind: 'account' })).conversas.map((c) => c.id)).toEqual([conv(1)])
      expect(calls(pending.rpc, 'get_collective_access')).toEqual([])
    })

    it('abre pelo link direto uma conversa do coletivo, e uma que o titular não lê continua 404', async () => {
      const { client, rpc } = withCollectives({ [C]: ['read_messages', 'send_messages'], [COL]: null })
      const open = await loadMessages(client, { kind: 'account' }, { conversationId: conv(2) })
      expect(open.aberta?.conversa.remetentes[0].de).toMatchObject({ kind: 'collective', id: C })
      expect(calls(rpc, 'get_recent_messages')).toEqual([{ target: conv(2) }])
      expect(await status(loadMessages(withCollectives({ [C]: ['read_messages'], [COL]: null }).client, { kind: 'account' }, { conversationId: conv(3) }))).toMatchObject({ status: 404 })
    })

    it('falha do banco ao conferir o acesso é falha (503), não uma lista sem as conversas do coletivo', async () => {
      const broken = fakeClient({
        list_my_profiles: ok([profileRow(ME, 'Minha atuação')]),
        list_my_collectives: ok([myCollective(C, 'Organização 1')]),
        list_conversations: ok(rows),
        get_collective_access: { data: null, error: { message: 'boom' } },
      })
      expect(await status(loadMessages(broken.client, { kind: 'account' }))).toMatchObject({ status: 503 })
    })
  })

  it('conversa cuja atuação do titular foi excluída continua legível (só leitura), com a outra ponta como título', async () => {
    const { client } = base({
      list_conversations: ok([conversation(5, { side_a: label('profile', null as unknown as string, 'Atuação excluída'), side_b: label('profile', OTHER, 'Interlocutor'), archived: true })]),
      get_conversation_details: ok([detail(5)]),
    })
    const result = await loadMessages(client, { kind: 'account' })
    expect(result.conversas).toHaveLength(1)
    expect(result.conversas[0]).toMatchObject({ id: conv(5), titulo: 'Interlocutor', arquivada: true, remetentes: [] })
    expect(result.conversas[0].meus[0].nome).toBe('Atuação excluída')
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
