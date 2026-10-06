import { describe, expect, it } from 'vitest'
import { PERMISSIONS, can, collectiveSections, isPermission, type Permissao } from '../../src/lib/collective-access'

const ID = '05000000-0000-4000-8000-000000000001'
const sections = (dono: boolean, permissoes: Permissao[], pendentes?: number | null) =>
  collectiveSections(ID, { dono, permissoes }, pendentes).map((s) => [s.key, s.to, s.label])

describe('collectiveSections', () => {
  it('Membro sem permissões vê só o dashboard básico', () => {
    expect(sections(false, [])).toEqual([['painel', `/coletivo/${ID}/painel`, 'Dashboard']])
  })

  it('o proprietário recebe todas as permissões e as seções exclusivas dele', () => {
    expect(sections(true, [...PERMISSIONS]).map(([key]) => key)).toEqual([
      'painel', 'mensagens', 'solicitacoes', 'eventos', 'membros', 'editar', 'perfil',
    ])
  })

  it('cada permissão libera somente a própria seção', () => {
    expect(sections(false, ['read_messages']).map(([key]) => key)).toEqual(['painel', 'mensagens'])
    // Enviar mensagens autoriza novos envios, não a leitura (RN-29).
    expect(sections(false, ['send_messages']).map(([key]) => key)).toEqual(['painel'])
    expect(sections(false, ['manage_requests']).map(([key]) => key)).toEqual(['painel', 'solicitacoes'])
    expect(sections(false, ['create_events']).map(([key]) => key)).toEqual(['painel', 'eventos'])
    expect(sections(false, ['remove_members']).map(([key]) => key)).toEqual(['painel', 'membros'])
  })

  it('editar o coletivo e o perfil público, e atribuir perfis, não se delegam: um perfil com todas as permissões não os ganha', () => {
    const keys = sections(false, [...PERMISSIONS]).map(([key]) => key)
    expect(keys).not.toContain('editar')
    expect(keys).not.toContain('perfil')
    expect(keys).toEqual(['painel', 'mensagens', 'solicitacoes', 'eventos', 'membros'])
  })

  it('editar, publicar e cancelar eventos sozinhos não abrem "Criar Evento"', () => {
    expect(sections(false, ['edit_events', 'publish_events', 'cancel_events']).map(([key]) => key)).toEqual(['painel'])
  })

  it('mostra quantos pedidos estão pendentes só quando há', () => {
    expect(sections(false, ['manage_requests'], 3)[1][2]).toBe('Solicitações (3)')
    expect(sections(false, ['manage_requests'], 0)[1][2]).toBe('Solicitações')
    expect(sections(false, ['manage_requests'], null)[1][2]).toBe('Solicitações')
  })
})

describe('permissões', () => {
  it('o catálogo tem as oito permissões aprovadas (RN-19) e rejeita qualquer outro valor', () => {
    expect(PERMISSIONS).toHaveLength(8)
    expect(isPermission('manage_requests')).toBe(true)
    for (const other of ['admin', 'transfer_ownership', '', null, 1]) expect(isPermission(other)).toBe(false)
  })

  it('can consulta somente as permissões efetivas', () => {
    expect(can({ dono: false, permissoes: ['read_messages'] }, 'read_messages')).toBe(true)
    expect(can({ dono: true, permissoes: [] }, 'read_messages')).toBe(false)
  })
})
