import { describe, expect, it } from 'vitest'
import { parseParty, parseRoute, normalizeText, textLength, routeKey } from '../../src/lib/messages'
import {
  identityOf,
  mapConversationDetails,
  mapConversations,
  mapLado,
  mapMessages,
  toConversaItem,
} from '../../src/server/mappers/messages'

const A = '02000000-0000-4000-8000-000000000001'
const B = '02000000-0000-4000-8000-000000000007'
const C = '05000000-0000-4000-8000-000000000001'
const CONV = '0d000000-0000-4000-8000-000000000001'
const label = (kind: string, id: string | null, name: string) => ({ kind, id, name })
const row = (extra = {}) => ({
  id: CONV,
  updated_at: '2026-10-06T12:00:00.123456+00:00',
  side_a: label('profile', A, 'Artista A'),
  side_b: label('profile', B, 'Interlocutor B'),
  blocked: false,
  archived: false,
  unread_count: 2,
  ...extra,
})

describe('formatos de mensagens', () => {
  it('lê profile:<uuid> e collective:<uuid> e recusa o resto', () => {
    expect(parseParty(`profile:${A}`)).toEqual({ kind: 'profile', id: A })
    expect(parseParty(`collective:${C}`)).toEqual({ kind: 'collective', id: C })
    for (const bad of [null, '', 'profile', `user:${A}`, 'profile:x', `profile:${A}:extra`]) expect(parseParty(bad)).toBeNull()
  })

  it('o par remetente>destinatário vai e volta num valor só', () => {
    const from = { kind: 'profile' as const, id: A }
    const to = { kind: 'collective' as const, id: C }
    expect(parseRoute(routeKey(from, to))).toEqual({ from, to })
    expect(parseRoute(`profile:${A}`)).toBeNull()
    expect(parseRoute(`profile:${A}>x`)).toBeNull()
    expect(parseRoute(`${routeKey(from, to)}>profile:${B}`)).toBeNull()
  })

  it('normaliza CRLF e conta caracteres, não unidades UTF-16', () => {
    expect(normalizeText('  a\r\nb  ')).toBe('a\nb')
    expect(textLength('👋'.repeat(2000))).toBe(2000)
    expect('👋'.repeat(2000).length).toBe(4000)
  })
})

describe('mapConversations', () => {
  it('mantém o cursor original com microssegundos e normaliza a data de exibição', () => {
    const [conversa] = mapConversations([row()])
    expect(conversa).toMatchObject({ id: CONV, cursor: '2026-10-06T12:00:00.123456+00:00', atualizadaEm: '2026-10-06T12:00:00.123Z', naoLidas: 2 })
    expect(conversa.lados[1]).toEqual({ kind: 'profile', id: B, nome: 'Interlocutor B' })
  })

  it('aceita pontas excluídas (id nulo) e recusa linhas malformadas', () => {
    expect(mapConversations([row({ side_a: label('profile', null, 'Atuação excluída') })])[0].lados[0].id).toBeNull()
    expect(() => mapConversations({})).toThrow()
    expect(() => mapConversations([row({ unread_count: -1 })])).toThrow()
    expect(() => mapConversations([row({ blocked: 'sim' })])).toThrow()
    expect(() => mapConversations([row({ side_b: label('user', B, 'x') })])).toThrow()
    expect(() => mapLado(null)).toThrow()
  })
})

describe('mapMessages e detalhes', () => {
  const message = (extra = {}) => ({
    id: '0e000000-0000-4000-8000-000000000001', body: 'Olá <b>mundo</b> 👋', created_at: '2026-10-06T12:00:00.5+00:00',
    sender_kind: 'profile', sender_id: A, sender_name: 'Artista A', ...extra,
  })

  it('devolve o texto como veio, sem interpretar HTML', () => {
    const [m] = mapMessages([message()])
    expect(m.texto).toBe('Olá <b>mundo</b> 👋')
    expect(m.cursor).toBe('2026-10-06T12:00:00.5+00:00')
    expect(m.autor).toEqual({ kind: 'profile', id: A, nome: 'Artista A' })
    expect(() => mapMessages([message({ body: '' })])).toThrow()
    expect(() => mapMessages([message({ sender_kind: 'x' })])).toThrow()
  })

  it('detalhes trazem última mensagem e bloqueadores', () => {
    const details = mapConversationDetails([
      { conversation_id: CONV, last_message: message(), blocked_by: [label('profile', B, 'Interlocutor B')] },
      { conversation_id: 'outra', last_message: null, blocked_by: [] },
    ])
    expect(details.get(CONV)?.ultima?.texto).toBe('Olá <b>mundo</b> 👋')
    expect(details.get(CONV)?.bloqueadaPor).toHaveLength(1)
    expect(details.get('outra')).toEqual({ ultima: null, bloqueadaPor: [] })
    expect(() => mapConversationDetails([{ conversation_id: CONV, last_message: 3, blocked_by: [] }])).toThrow()
    expect(() => mapConversationDetails([{ conversation_id: CONV, last_message: null }])).toThrow()
  })
})

describe('toConversaItem', () => {
  const [conversa] = mapConversations([row()])
  const details = mapConversationDetails([
    {
      conversation_id: CONV,
      last_message: { id: 'm', body: 'Oi', created_at: '2026-10-06T12:00:00+00:00', sender_kind: 'profile', sender_id: B, sender_name: 'Interlocutor B' },
      blocked_by: [label('profile', A, 'Artista A')],
    },
  ]).get(CONV)

  it('o título é o interlocutor e o remetente é a minha atuação', () => {
    const item = toConversaItem(conversa, details, identityOf([{ kind: 'profile', id: A }]))
    expect(item.titulo).toBe('Interlocutor B')
    expect(item.remetentes).toEqual([{ de: conversa.lados[0], para: conversa.lados[1] }])
    expect(item.bloqueadaPorMim).toBe(true)
    expect(item.bloqueadaComo).toEqual(conversa.lados[0])
    expect(item.ultima).toMatchObject({ texto: 'Oi', minha: false })
  })

  it('o bloqueio feito pelo outro lado não é meu', () => {
    const item = toConversaItem(conversa, details, identityOf([{ kind: 'profile', id: B }]))
    expect(item.titulo).toBe('Artista A')
    expect(item.bloqueadaPorMim).toBe(false)
    expect(item.bloqueadaComo).toBeNull()
    expect(item.ultima?.minha).toBe(true)
  })

  it('duas atuações do mesmo titular: título com os dois lados e os dois sentidos de envio', () => {
    const item = toConversaItem(conversa, undefined, identityOf([{ kind: 'profile', id: A }, { kind: 'profile', id: B }]))
    expect(item.titulo).toBe('Artista A ↔ Interlocutor B')
    expect(item.remetentes.map((r) => [r.de.nome, r.para.nome])).toEqual([['Artista A', 'Interlocutor B'], ['Interlocutor B', 'Artista A']])
    expect(item.ultima).toBeNull()
  })

  it('pontas excluídas nunca são minhas', () => {
    const [deleted] = mapConversations([row({ side_a: label('profile', null, 'Atuação excluída') })])
    expect(toConversaItem(deleted, undefined, identityOf([{ kind: 'profile', id: B }])).titulo).toBe('Atuação excluída')
  })
})
