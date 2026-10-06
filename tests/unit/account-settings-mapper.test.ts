import { describe, expect, it } from 'vitest'
import { mapAccountDetails, mapMyProfile, mapTaxonomy } from '../../src/server/mappers/account-settings'

const account = (extra = {}) => ({
  name: 'Pessoa A sintética', cpf_masked: '***.982.247-**', birth_date: '1990-01-01', gender: null, city: 'Recife', state_code: 'PE',
  email: 'fixture-active@example.invalid', phone: '+5581999000001', phone_is_whatsapp: true, whatsapp_number: null, ...extra,
})

describe('mapAccountDetails', () => {
  it('mapeia a conta e as três escolhas de WhatsApp (RN-36)', () => {
    expect(mapAccountDetails(account())).toEqual({
      nome: 'Pessoa A sintética', cpfMascarado: '***.982.247-**', nascimento: '1990-01-01', genero: null, cidade: 'Recife', estado: 'PE',
      email: 'fixture-active@example.invalid', celular: '+5581999000001', whatsapp: { tipo: 'same' },
    })
    expect(mapAccountDetails(account({ phone_is_whatsapp: false, whatsapp_number: '+5581988887777', gender: 'Mulher' }))).toMatchObject({
      genero: 'Mulher', whatsapp: { tipo: 'other', numero: '+5581988887777' },
    })
    expect(mapAccountDetails(account({ phone_is_whatsapp: false }))).toMatchObject({ whatsapp: { tipo: 'none' } })
  })

  it('conta sem acesso (nulo) não é erro', () => {
    expect(mapAccountDetails(null)).toBeNull()
  })

  it('linha malformada falha em vez de mostrar dados parciais', () => {
    for (const bad of [
      'texto', [], account({ name: '' }), account({ state_code: 'XX' }), account({ birth_date: '01/01/1990' }), account({ phone_is_whatsapp: 'sim' }),
      account({ phone_is_whatsapp: true, whatsapp_number: '+5581988887777' }), account({ gender: 3 }), account({ cpf_masked: undefined }),
    ])
      expect(() => mapAccountDetails(bad)).toThrow()
  })
})

const profile = (extra = {}) => ({
  id: '02000000-0000-4000-8000-000000000001', kind: 'artist', name: 'Artista', description: '**bio**', city: 'Recife', state_code: 'PE',
  social_links: { instagram: 'https://instagram.com/x', website: 'https://example.invalid', tiktok: 'https://x.invalid', youtube: 'javascript:alert(1)' },
  color: '#00FF88', published: true, is_default: false,
  styles: [{ style: 'techno', substyle: null }, { style: 'house', substyle: 'acid house' }],
  professional: {
    booking_email: 'b@example.invalid', contact_email: null, contact_phone: '+5581977776666', fee_cents: 150000, cnpj: null,
    service_type: null, service_other: null, audiovisual_type: null, presskit_url: 'https://example.invalid/kit', portfolio_url: null,
  },
  ...extra,
})

describe('mapMyProfile', () => {
  it('mapeia a atuação, com redes válidas (website -> site), cor em minúsculas, estilos e dados profissionais', () => {
    expect(mapMyProfile(profile())).toEqual({
      id: '02000000-0000-4000-8000-000000000001', tipo: 'artista', nome: 'Artista', descricao: '**bio**', cidade: 'Recife', estado: 'PE',
      cor: '#00ff88', publicado: true, padrao: false,
      redes: { instagram: 'https://instagram.com/x', site: 'https://example.invalid' },
      estilos: [{ estilo: 'techno' }, { estilo: 'house', subestilo: 'acid house' }],
      profissional: {
        emailBooking: 'b@example.invalid', emailContato: null, telefoneContato: '+5581977776666', cacheCentavos: 150000, cnpj: null,
        tipoServico: null, servicoOutro: null, tipoAudiovisual: null, presskit: 'https://example.invalid/kit', portfolio: null,
      },
    })
  })

  it('integrante não tem dados profissionais; cor ausente e descrição vazia são válidas', () => {
    expect(mapMyProfile(profile({ kind: 'member', professional: null, color: null, description: '', social_links: {}, styles: [] }))).toMatchObject({
      tipo: 'integrante', cor: null, descricao: '', redes: {}, estilos: [], profissional: null,
    })
  })

  it('perfil que não é do titular (nulo) não é erro', () => {
    expect(mapMyProfile(null)).toBeNull()
  })

  it('linha malformada falha', () => {
    for (const bad of [
      'x', profile({ kind: 'band' }), profile({ published: 'sim' }), profile({ color: 'verde' }), profile({ styles: null }),
      profile({ styles: [3] }), profile({ description: null }), profile({ state_code: 'XX' }),
      profile({ professional: { fee_cents: -1 } }), profile({ professional: { fee_cents: 1.5 } }), profile({ professional: 'x' }),
    ])
      expect(() => mapMyProfile(bad)).toThrow()
  })
})

describe('mapTaxonomy', () => {
  it('agrupa subestilos por estilo e ordena em pt-BR', () => {
    expect(
      mapTaxonomy(
        [{ name: 'techno' }, { name: 'áudio não musical' }, { name: 'house' }],
        [{ style: 'techno', name: 'raw techno' }, { style: 'techno', name: 'acid techno' }, { style: 'house', name: 'deep house' }],
      ),
    ).toEqual([
      { estilo: 'áudio não musical', subestilos: [] },
      { estilo: 'house', subestilos: ['deep house'] },
      { estilo: 'techno', subestilos: ['acid techno', 'raw techno'] },
    ])
  })

  it('rejeita respostas que não são listas', () => {
    expect(() => mapTaxonomy(null, [])).toThrow()
    expect(() => mapTaxonomy([], [3])).toThrow()
  })
})
