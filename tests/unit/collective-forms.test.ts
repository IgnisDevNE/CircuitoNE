import { describe, expect, it } from 'vitest'
import { PERMISSIONS } from '../../src/lib/collective-access'
import { parseCloseForm, parseCollectiveForm, parseCollectiveProfileForm, parseNewCollectiveForm, parseRoleForm } from '../../src/lib/collective-forms'
import { mapCollectiveRoles, mapMemberRoster, mfaState } from '../../src/server/mappers/collective-manage'
import { mapExplorePerfis, mapRestrictedDetails } from '../../src/server/mappers/explore'

const form = (fields: Record<string, string | string[]>) => {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(fields)) for (const v of Array.isArray(value) ? value : [value]) params.append(key, v)
  return params
}

describe('parseCollectiveForm', () => {
  const valid = { name: ' Coletivo ', description: 'Texto\r\nlinha', activity: 'Música', city: 'Recife', state_code: 'PE', cnpj: '' }

  it('aparar espaços, normalizar quebras de linha e aceitar CNPJ vazio num coletivo', () => {
    expect(parseCollectiveForm(form(valid), false)).toEqual({
      ok: true,
      payload: { name: 'Coletivo', description: 'Texto\nlinha', activity: 'Música', city: 'Recife', state_code: 'PE', cnpj: null },
    })
  })

  it('produtora exige CNPJ válido (14 caracteres, alfanumérico, com ou sem pontuação)', () => {
    expect(parseCollectiveForm(form(valid), true)).toMatchObject({ ok: false, fields: { cnpj: 'Produtora exige CNPJ.' } })
    expect(parseCollectiveForm(form({ ...valid, cnpj: '123' }), true)).toMatchObject({ ok: false, fields: { cnpj: expect.stringContaining('14 caracteres') } })
    expect(parseCollectiveForm(form({ ...valid, cnpj: '12.abc.345/01de-35' }), true)).toMatchObject({ ok: true, payload: { cnpj: '12ABC34501DE35' } })
  })

  it('limites do banco: nome 200, descrição 10.000, atividade 200, cidade 150 e UF conhecida', () => {
    const result = parseCollectiveForm(
      form({ name: 'n'.repeat(201), description: 'd'.repeat(10001), activity: 'a'.repeat(201), city: 'c'.repeat(151), state_code: 'ZZ', cnpj: '' }),
      false,
    )
    expect(result).toMatchObject({ ok: false, fields: { name: expect.any(String), description: expect.any(String), activity: expect.any(String), city: expect.any(String), state_code: 'Escolha o estado.' } })
    expect(parseCollectiveForm(form({ ...valid, name: 'n'.repeat(200), description: 'd'.repeat(10000) }), false)).toMatchObject({ ok: true })
  })
})

describe('parseNewCollectiveForm', () => {
  const valid = { kind: 'collective', name: ' Coletivo ', description: 'Texto\r\nlinha', activity: 'Música', city: 'Recife', state_code: 'PE', cnpj: '' }

  it('monta o payload de create_collective: tipo, cadastro, cor e redes (o site vira "website")', () => {
    expect(
      parseNewCollectiveForm(form({ ...valid, instagram: 'https://instagram.com/x', site: 'https://site.example.invalid', use_color: 'on', color: '#AABBCC' })),
    ).toEqual({
      ok: true,
      payload: {
        kind: 'collective',
        name: 'Coletivo',
        description: 'Texto\nlinha',
        activity: 'Música',
        city: 'Recife',
        state_code: 'PE',
        color: '#aabbcc',
        social_links: { instagram: 'https://instagram.com/x', website: 'https://site.example.invalid' },
      },
    })
  })

  it('sem "usar esta cor" a cor vai nula; CNPJ de coletivo é opcional, mas normalizado quando informado', () => {
    expect(parseNewCollectiveForm(form({ ...valid, color: '#aabbcc' }))).toMatchObject({ ok: true, payload: { color: null } })
    const withCnpj = parseNewCollectiveForm(form({ ...valid, cnpj: '12.345.678/0001-95' }))
    expect(withCnpj).toMatchObject({ ok: true, payload: { cnpj: '12345678000195' } })
    const without = parseNewCollectiveForm(form(valid))
    expect(without.ok && 'cnpj' in without.payload).toBe(false)
  })

  it('produtora exige CNPJ no campo "cnpj"; com CNPJ válido passa', () => {
    expect(parseNewCollectiveForm(form({ ...valid, kind: 'producer' }))).toEqual({ ok: false, fields: { cnpj: 'Produtora exige CNPJ.' } })
    expect(parseNewCollectiveForm(form({ ...valid, kind: 'producer', cnpj: '12345678000195' }))).toMatchObject({ ok: true, payload: { kind: 'producer', cnpj: '12345678000195' } })
  })

  it('o tipo é obrigatório e só aceita coletivo ou produtora', () => {
    const { kind: _kind, ...semTipo } = valid
    expect(parseNewCollectiveForm(form(semTipo))).toEqual({ ok: false, fields: { kind: 'Escolha se é um coletivo ou uma produtora.' } })
    expect(parseNewCollectiveForm(form({ ...valid, kind: 'clube' }))).toMatchObject({ ok: false, fields: { kind: expect.any(String) } })
  })

  it('junta os erros de cadastro, cor e redes num só retorno', () => {
    const result = parseNewCollectiveForm(form({ ...valid, name: '', city: 'Fortaleza', use_color: 'on', color: 'vermelho', instagram: 'instagram.com/x' }))
    expect(result).toEqual({
      ok: false,
      fields: {
        name: 'Informe o nome.',
        city: 'Escolha uma cidade de PE da lista.',
        color: 'Escolha uma cor válida.',
        instagram: 'Informe o endereço completo, começando por https://',
      },
    })
  })
})

describe('parseCollectiveProfileForm', () => {
  it('cor opcional e redes sociais só com endereço web completo', () => {
    expect(parseCollectiveProfileForm(form({ description: 'Texto', color: '#FF2040', site: 'https://x.example.invalid/p?q=1' }))).toEqual({
      ok: true,
      payload: { description: 'Texto', color: null, social_links: { website: 'https://x.example.invalid/p?q=1' } },
    })
    expect(parseCollectiveProfileForm(form({ description: 'Texto', use_color: 'on', color: '#FF2040' }))).toMatchObject({ ok: true, payload: { color: '#ff2040' } })
    expect(parseCollectiveProfileForm(form({ description: 'Texto', facebook: 'ftp://x', instagram: 'https://u:p@x.invalid' }))).toMatchObject({
      ok: false,
      fields: { facebook: expect.any(String), instagram: expect.any(String) },
    })
  })
})

describe('parseRoleForm', () => {
  it('nome obrigatório (até 100) e só permissões do catálogo, ordenadas', () => {
    expect(parseRoleForm(form({ role_name: 'Produção', permission: ['read_messages', 'manage_requests'] }))).toEqual({
      ok: true,
      payload: { role_name: 'Produção', permissions: ['manage_requests', 'read_messages'] },
    })
    expect(parseRoleForm(form({ role_name: 'x'.repeat(101) }))).toMatchObject({ ok: false, fields: { role_name: expect.any(String) } })
    expect(parseRoleForm(form({ role_name: 'Tudo', permission: [...PERMISSIONS] }))).toMatchObject({ ok: true, payload: { permissions: [...PERMISSIONS] } })
    expect(parseRoleForm(form({ role_name: 'Dono', permission: ['transfer_ownership'] }))).toMatchObject({ ok: false, fields: { permission: 'Permissão desconhecida.' } })
  })
})

describe('parseCloseForm', () => {
  it('motivo (até 2.000) e confirmação digitada', () => {
    expect(parseCloseForm(form({ reason: ' Fim \r\n do projeto ', confirmation: ' ENCERRAR ' }))).toEqual({ ok: true, payload: { reason: 'Fim \n do projeto' } })
    expect(parseCloseForm(form({ reason: 'x'.repeat(2001), confirmation: 'ENCERRAR' }))).toMatchObject({ ok: false })
    expect(parseCloseForm(form({ reason: 'Fim', confirmation: 'encerrar' }))).toMatchObject({ ok: false, fields: { confirmation: expect.any(String) } })
  })
})

describe('mfaState', () => {
  it('aal2 confirmada; fator existente em sessão aal1 pede confirmação; sem fator pede ativação', () => {
    expect(mfaState('aal2', 'aal2')).toBe('confirmada')
    expect(mfaState('aal1', 'aal2')).toBe('confirmar')
    expect(mfaState('aal1', 'aal1')).toBe('ativar')
    expect(mfaState(null, null)).toBe('ativar')
  })
})

describe('mappers de gestão', () => {
  it('perfis de acesso: permissão fora do catálogo é resposta inválida', () => {
    expect(mapCollectiveRoles([{ id: 'r', name: 'Ops', permissions: ['create_events', 'create_events'] }])).toEqual([{ id: 'r', nome: 'Ops', permissoes: ['create_events'], embutido: false }])
    expect(() => mapCollectiveRoles([{ id: 'r', name: 'Ops', permissions: ['transfer_ownership'] }])).toThrow()
    expect(() => mapCollectiveRoles({})).toThrow()
  })

  it('lista de membros: o nome da atuação só vem junto do identificador; datas inválidas falham', () => {
    const row = { user_id: 'u', member_name: 'Pessoa', artist_profile_id: null, artist_name: null, role_id: 'r', role_name: 'Membro', last_activity_at: null, is_owner: false }
    expect(mapMemberRoster([row])).toEqual([{ userId: 'u', nome: 'Pessoa', artista: null, cargoId: 'r', cargo: 'Membro', ultimaAtividade: null, dono: false }])
    expect(() => mapMemberRoster([{ ...row, artist_profile_id: 'a', artist_name: null }])).toThrow()
    expect(() => mapMemberRoster([{ ...row, last_activity_at: 'ontem' }])).toThrow()
    expect(() => mapMemberRoster([{ ...row, is_owner: 'sim' }])).toThrow()
  })
})

describe('mappers do catálogo', () => {
  it('dados restritos: cachê formatado, links só http(s), tipos rotulados e valores inválidos recusados', () => {
    const details = mapRestrictedDetails([
      { profile_id: 'a', booking_email: 'b@example.invalid', fee_cents: 0, presskit_url: 'javascript:alert(1)', portfolio_url: 'https://p.example.invalid', audiovisual_type: 'photo' },
      { profile_id: 'b' },
    ])
    expect(details.get('a')).toEqual({ emailBooking: 'b@example.invalid', cache: 'R$ 0,00', portfolio: 'https://p.example.invalid', tipo: 'Fotografia', tipoValor: 'photo' })
    expect(details.get('b')).toEqual({})
    expect(() => mapRestrictedDetails([{ profile_id: 'a', fee_cents: -1 }])).toThrow()
    expect(() => mapRestrictedDetails([{ profile_id: 'a', fee_cents: 1.5 }])).toThrow()
    expect(() => mapRestrictedDetails({})).toThrow()
  })

  it('o aviso de restrito só vale para atuações de outras pessoas sem linha profissional', () => {
    const rows = [{ id: 'm', name: 'Minha', description: '', city: 'Recife', state_code: 'PE' }]
    expect(mapExplorePerfis('servicos', rows, [], [], new Set(['m'])).restritoIndisponivel).toBe(false)
    expect(mapExplorePerfis('servicos', [], [], [], new Set()).restritoIndisponivel).toBe(false)
    expect(mapExplorePerfis('servicos', rows, [], [], new Set()).restritoIndisponivel).toBe(true)
  })
})
