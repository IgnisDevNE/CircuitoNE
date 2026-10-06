// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { mapMyCollectives, mapMyProfiles, sumUnread } from '../../src/server/mappers/account'

const profile = (extra = {}) => ({
  id: '02000000-0000-4000-8000-000000000001',
  kind: 'artist',
  name: 'Artista sintético público',
  city: 'Recife',
  state_code: 'PE',
  published: true,
  is_default: true,
  ...extra,
})
const collective = (extra = {}) => ({
  id: '05000000-0000-4000-8000-000000000001',
  kind: 'collective',
  name: 'Organização sintética 1',
  city: 'Recife',
  state_code: 'PE',
  state: 'approved',
  role_name: 'Membro',
  is_owner: true,
  ...extra,
})

describe('mapMyProfiles', () => {
  it('traduz o banco para a UI: kind vira tipo, state_code vira estado e published vira publicado', () => {
    expect(mapMyProfiles([profile(), profile({ id: 'b', kind: 'services', published: false, is_default: false }),
      profile({ id: 'c', kind: 'audiovisual' }), profile({ id: 'd', kind: 'member' })])).toEqual([
      { id: '02000000-0000-4000-8000-000000000001', tipo: 'artista', nome: 'Artista sintético público', cidade: 'Recife', estado: 'PE', publicado: true, padrao: true },
      { id: 'b', tipo: 'servicos', nome: 'Artista sintético público', cidade: 'Recife', estado: 'PE', publicado: false, padrao: false },
      expect.objectContaining({ id: 'c', tipo: 'audiovisual' }),
      expect.objectContaining({ id: 'd', tipo: 'integrante' }),
    ])
  })

  it('lista vazia é válida; resposta malformada falha em vez de virar lista vazia', () => {
    expect(mapMyProfiles([])).toEqual([])
    expect(() => mapMyProfiles(null)).toThrow('Resposta inválida')
    expect(() => mapMyProfiles({})).toThrow('Resposta inválida')
    expect(() => mapMyProfiles([profile({ kind: 'dj' })])).toThrow('Resposta inválida')
    expect(() => mapMyProfiles([profile({ state_code: 'XX' })])).toThrow('Resposta inválida')
    expect(() => mapMyProfiles([profile({ published: 'sim' })])).toThrow('Resposta inválida')
    expect(() => mapMyProfiles([profile({ is_default: null })])).toThrow('Resposta inválida')
    expect(() => mapMyProfiles([profile({ name: '' })])).toThrow('Resposta inválida')
    expect(() => mapMyProfiles(['x'])).toThrow('Resposta inválida')
  })
})

describe('mapMyCollectives', () => {
  it('traduz tipo, UF, situação, cargo e se a pessoa responde pelo coletivo', () => {
    expect(mapMyCollectives([collective(), collective({ id: 'p', kind: 'producer', state: 'pending', is_owner: false, role_name: 'Operações' })])).toEqual([
      { id: '05000000-0000-4000-8000-000000000001', nome: 'Organização sintética 1', tipo: 'coletivo', cidade: 'Recife', estado: 'PE', situacao: 'approved', cargo: 'Membro', dono: true },
      { id: 'p', nome: 'Organização sintética 1', tipo: 'produtora', cidade: 'Recife', estado: 'PE', situacao: 'pending', cargo: 'Operações', dono: false },
    ])
  })

  it('rejeita linhas malformadas', () => {
    expect(() => mapMyCollectives(undefined)).toThrow('Resposta inválida')
    expect(() => mapMyCollectives([collective({ kind: 'clube' })])).toThrow('Resposta inválida')
    expect(() => mapMyCollectives([collective({ state: 'aprovado' })])).toThrow('Resposta inválida')
    expect(() => mapMyCollectives([collective({ role_name: null })])).toThrow('Resposta inválida')
    expect(() => mapMyCollectives([collective({ is_owner: 1 })])).toThrow('Resposta inválida')
  })
})

describe('sumUnread', () => {
  it('soma as não lidas de todas as conversas', () => {
    expect(sumUnread([{ unread_count: 2 }, { unread_count: 0 }, { unread_count: 5, blocked: true }])).toBe(7)
    expect(sumUnread([])).toBe(0)
  })

  it('contagem inválida falha em vez de aparecer como zero', () => {
    expect(() => sumUnread(null)).toThrow('Resposta inválida')
    expect(() => sumUnread([{ unread_count: '2' }])).toThrow('Resposta inválida')
    expect(() => sumUnread([{ unread_count: -1 }])).toThrow('Resposta inválida')
    expect(() => sumUnread([{}])).toThrow('Resposta inválida')
    expect(() => sumUnread([1])).toThrow('Resposta inválida')
  })
})
