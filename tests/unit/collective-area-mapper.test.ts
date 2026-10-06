import { describe, expect, it } from 'vitest'
import {
  mapCollectiveAccess,
  mapDecisionReason,
  mapManagedEvents,
  mapMyRequests,
  mapRequestQueue,
  summarizeCollectiveConversations,
} from '../../src/server/mappers/collective-area'

const C = '05000000-0000-4000-8000-000000000001'

describe('mapCollectiveAccess', () => {
  it('sem vínculo com coletivo aprovado o banco devolve nulo', () => {
    expect(mapCollectiveAccess(null)).toBeNull()
  })

  it('mapeia proprietário e permissões, sem duplicar', () => {
    expect(mapCollectiveAccess({ owner: false, role_id: 'r', permissions: ['read_messages', 'read_messages', 'manage_requests'] })).toEqual({
      dono: false,
      permissoes: ['read_messages', 'manage_requests'],
    })
    expect(mapCollectiveAccess({ owner: true, role_id: 'r', permissions: [] })).toEqual({ dono: true, permissoes: [] })
  })

  it('rejeita resposta malformada ou permissão desconhecida', () => {
    for (const value of [[], 'x', { owner: 'sim', permissions: [] }, { owner: true }, { owner: true, permissions: ['root'] }, { owner: true, permissions: [1] }])
      expect(() => mapCollectiveAccess(value)).toThrow('Resposta inválida')
  })
})

describe('mapDecisionReason', () => {
  it('devolve o motivo da decisão ou nulo', () => {
    expect(mapDecisionReason({ id: C, state: 'rejected', reason: 'Sem contato' })).toBe('Sem contato')
    expect(mapDecisionReason({ id: C, state: 'pending', reason: null })).toBeNull()
    expect(() => mapDecisionReason(null)).toThrow('Resposta inválida')
  })
})

describe('mapManagedEvents', () => {
  const row = (extra = {}) => ({ id: 'e1', name: 'Evento sintético', state: 'draft', starts_at: '2026-10-08T15:00:00+00:00', ends_at: null, version: 1, ...extra })

  it('traz rascunhos e cancelados com o período da consulta', () => {
    expect(mapManagedEvents([row(), row({ id: 'e2', state: 'cancelled', ends_at: '2026-10-08T20:00:00+00:00' })], 'future')).toEqual([
      { id: 'e1', nome: 'Evento sintético', situacao: 'draft', periodo: 'future', inicio: '2026-10-08T15:00:00.000Z', fim: null },
      { id: 'e2', nome: 'Evento sintético', situacao: 'cancelled', periodo: 'future', inicio: '2026-10-08T15:00:00.000Z', fim: '2026-10-08T20:00:00.000Z' },
    ])
  })

  it('rejeita estado desconhecido, data inválida e resposta que não é lista', () => {
    expect(() => mapManagedEvents([row({ state: 'archived' })], 'past')).toThrow('Resposta inválida')
    expect(() => mapManagedEvents([row({ starts_at: 'ontem' })], 'past')).toThrow('Resposta inválida')
    expect(() => mapManagedEvents({}, 'past')).toThrow('Resposta inválida')
  })
})

describe('summarizeCollectiveConversations', () => {
  const side = (kind: string, id: string) => ({ kind, id, name: 'x' })
  const conversation = (a: unknown, b: unknown, unread: number) => ({ id: 'c', side_a: a, side_b: b, unread_count: unread })

  it('conta só as conversas em que o coletivo é um dos lados e soma as não lidas dele', () => {
    const rows = [
      conversation(side('profile', 'p1'), side('collective', C), 2),
      conversation(side('collective', C), side('collective', 'outro'), 1),
      conversation(side('profile', 'p1'), side('collective', 'outro'), 5),
      conversation(side('profile', 'p1'), side('profile', 'p2'), 7),
      conversation(null, side('collective', C), 0),
    ]
    expect(summarizeCollectiveConversations(rows, C)).toEqual({ conversas: 3, naoLidas: 3 })
    expect(summarizeCollectiveConversations([], C)).toEqual({ conversas: 0, naoLidas: 0 })
  })

  it('rejeita contagem inválida ou resposta que não é lista', () => {
    expect(() => summarizeCollectiveConversations([conversation(null, null, -1)], C)).toThrow('Resposta inválida')
    expect(() => summarizeCollectiveConversations([conversation(null, null, 1.5)], C)).toThrow('Resposta inválida')
    expect(() => summarizeCollectiveConversations({}, C)).toThrow('Resposta inválida')
  })
})

describe('mapRequestQueue', () => {
  const row = (extra = {}) => ({
    id: 'r1', created_at: '2026-10-07T12:00:00+00:00', message: 'Quero entrar', requester_name: 'Pessoa sintética',
    profile_id: 'p1', profile_name: 'Artista sintético', profile_kind: 'artist', profile_published: true, ...extra,
  })

  it('traz a conta, a atuação escolhida e a mensagem', () => {
    expect(mapRequestQueue([row()])).toEqual([
      {
        id: 'r1', criadoEm: '2026-10-07T12:00:00.000Z', mensagem: 'Quero entrar', nome: 'Pessoa sintética',
        atuacao: { id: 'p1', nome: 'Artista sintético', tipo: 'artista', publicada: true },
      },
    ])
  })

  it('pedido sem atuação e sem mensagem vem só com o nome da conta', () => {
    expect(mapRequestQueue([row({ profile_id: null, profile_name: null, profile_kind: null, profile_published: null, message: '' })])).toEqual([
      { id: 'r1', criadoEm: '2026-10-07T12:00:00.000Z', mensagem: '', nome: 'Pessoa sintética', atuacao: null },
    ])
  })

  it('atuação não publicada fica marcada como tal; tipos de atuação do banco viram os da UI', () => {
    expect(mapRequestQueue([row({ profile_published: false, profile_kind: 'member' })])[0].atuacao).toMatchObject({ tipo: 'integrante', publicada: false })
  })

  it('rejeita linha malformada', () => {
    expect(() => mapRequestQueue([row({ requester_name: '' })])).toThrow('Resposta inválida')
    expect(() => mapRequestQueue([row({ message: null })])).toThrow('Resposta inválida')
    expect(() => mapRequestQueue([row({ profile_kind: 'dj' })])).toThrow('Resposta inválida')
    expect(() => mapRequestQueue(undefined)).toThrow('Resposta inválida')
  })
})

describe('mapMyRequests', () => {
  it('mapeia os pedidos do titular com a situação', () => {
    expect(mapMyRequests([{ id: 'r', collective_id: C, state: 'cancelled', created_at: '2026-10-07T12:00:00+00:00' }])).toEqual([
      { id: 'r', coletivoId: C, situacao: 'cancelled', criadoEm: '2026-10-07T12:00:00.000Z' },
    ])
  })

  it('rejeita situação desconhecida', () => {
    expect(() => mapMyRequests([{ id: 'r', collective_id: C, state: 'esquecido', created_at: '2026-10-07T12:00:00+00:00' }])).toThrow('Resposta inválida')
    expect(() => mapMyRequests(null)).toThrow('Resposta inválida')
  })
})
