import { describe, expect, it } from 'vitest'
import {
  CONFIRM_DELETE_ACCOUNT,
  CONFIRM_DELETE_PROFILE,
  encodeStyle,
  normalizeCnpj,
  normalizePhone,
  normalizeUrl,
  parseAccountForm,
  parseConfirmation,
  parseEmailForm,
  parseMfaCode,
  parsePasswordForm,
  parseProfessionalForm,
  parseProfileForm,
} from '../../src/lib/account-forms'
import { GENEROS } from '../../src/data/types'
import { formatCacheCents } from '../../src/lib/utils'

const form = (fields: Record<string, string | string[]>) => {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(fields)) for (const item of Array.isArray(value) ? value : [value]) params.append(key, item)
  return params
}
const PHONE = '+5581999000001'

describe('normalizações', () => {
  it('telefone: E.164 com "+", brasileiro com ou sem 55, e recusa o resto', () => {
    expect(normalizePhone('+55 (81) 99999-0000')).toBe('+5581999990000')
    expect(normalizePhone('81 99999-0000')).toBe('+5581999990000')
    expect(normalizePhone('(81) 3333-4444')).toBe('+558133334444')
    expect(normalizePhone('5581999990000')).toBe('+5581999990000')
    expect(normalizePhone('+351 912 345 678')).toBe('+351912345678')
    for (const invalid of ['', 'abc', '9999', '+0123456789', '081999990000', '+55', '81 99999-00001']) expect(normalizePhone(invalid)).toBeNull()
  })

  it('URL: só http/https completo, sem credenciais nem espaços', () => {
    expect(normalizeUrl(' https://instagram.com/sintetico ')).toBe('https://instagram.com/sintetico')
    expect(normalizeUrl('http://example.invalid')).toBe('http://example.invalid')
    for (const invalid of ['@sintetico', 'instagram.com/x', 'javascript:alert(1)', 'ftp://example.invalid', 'https://user:pw@example.invalid', 'https://a b.invalid', `https://example.invalid/${'x'.repeat(2048)}`])
      expect(normalizeUrl(invalid)).toBeNull()
  })

  it('CNPJ: remove pontuação, põe em maiúsculas e exige 12 alfanuméricos + 2 dígitos', () => {
    expect(normalizeCnpj('12.abc.345/01de-35')).toBe('12ABC34501DE35')
    expect(normalizeCnpj('11.222.333/0001-81')).toBe('11222333000181')
    for (const invalid of ['123', '12ABC34501DEAB', '1122233300018']) expect(normalizeCnpj(invalid)).toBeNull()
  })

  it('formata cachê em centavos como o campo mostra', () => {
    expect(formatCacheCents(150000)).toBe('R$ 1.500,00')
    expect(formatCacheCents(5)).toBe('R$ 0,05')
  })
})

describe('parseAccountForm', () => {
  const valid = { nome: ' Pessoa Teste ', genero: '', cidade: 'Olinda', estado: 'PE', whatsapp: 'same' }

  it('aceita os dados e normaliza (nome aparado, gênero vazio = não informar)', () => {
    expect(parseAccountForm(form(valid), PHONE)).toEqual({
      ok: true,
      payload: { name: 'Pessoa Teste', gender: null, city: 'Olinda', state_code: 'PE', phone_is_whatsapp: true, whatsapp_number: null },
    })
  })

  it('RN-36: outro número vira E.164; sem WhatsApp zera o número', () => {
    expect(parseAccountForm(form({ ...valid, whatsapp: 'other', whatsappNumero: '81 98888-7777', genero: 'Feminino' }), PHONE)).toEqual({
      ok: true,
      payload: { name: 'Pessoa Teste', gender: 'Feminino', city: 'Olinda', state_code: 'PE', phone_is_whatsapp: false, whatsapp_number: '+5581988887777' },
    })
    expect(parseAccountForm(form({ ...valid, whatsapp: 'none', whatsappNumero: '81 98888-7777' }), PHONE)).toMatchObject({
      ok: true,
      payload: { phone_is_whatsapp: false, whatsapp_number: null },
    })
  })

  it('devolve erros por campo e os valores enviados (sem lançar)', () => {
    const result = parseAccountForm(form({ nome: ' ', genero: 'x'.repeat(101), cidade: '', estado: 'XX', whatsapp: 'talvez' }), PHONE)
    expect(result).toEqual({
      ok: false,
      errors: {
        nome: 'Informe seu nome completo.',
        genero: 'Escolha uma opção da lista ou deixe em branco.',
        cidade: 'Escolha a cidade.',
        estado: 'Escolha o estado.',
        whatsapp: 'Escolha uma opção.',
      },
      values: expect.objectContaining({ estado: 'XX', whatsapp: 'talvez' }),
    })
    expect(parseAccountForm(form({ ...valid, nome: 'x'.repeat(201), cidade: 'y'.repeat(151) }), PHONE)).toMatchObject({
      ok: false,
      errors: { nome: 'Use até 200 caracteres.', cidade: 'Escolha uma cidade de PE da lista.' },
    })
  })

  it('RN-04: gênero só aceita os valores canônicos (ou vazio); cidade precisa pertencer à UF', () => {
    for (const genero of GENEROS) expect(parseAccountForm(form({ ...valid, genero }), PHONE)).toMatchObject({ ok: true, payload: { gender: genero } })
    for (const genero of ['masculino', 'Pessoa não binária', 'Outro']) {
      expect(parseAccountForm(form({ ...valid, genero }), PHONE)).toMatchObject({ ok: false, errors: { genero: expect.any(String) } })
    }
    expect(parseAccountForm(form({ ...valid, cidade: 'Fortaleza', estado: 'PE' }), PHONE)).toMatchObject({ ok: false, errors: { cidade: 'Escolha uma cidade de PE da lista.' } })
    expect(parseAccountForm(form({ ...valid, cidade: 'Fortaleza', estado: 'CE' }), PHONE)).toMatchObject({ ok: true, payload: { city: 'Fortaleza', state_code: 'CE' } })
    expect(parseAccountForm(form({ ...valid, cidade: 'recife' }), PHONE)).toMatchObject({ ok: false, errors: { cidade: expect.any(String) } })
  })

  it('outro número exige número válido e diferente do celular', () => {
    expect(parseAccountForm(form({ ...valid, whatsapp: 'other' }), PHONE)).toMatchObject({ ok: false, errors: { whatsappNumero: expect.stringContaining('número válido') } })
    expect(parseAccountForm(form({ ...valid, whatsapp: 'other', whatsappNumero: '123' }), PHONE)).toMatchObject({ ok: false, errors: { whatsappNumero: expect.any(String) } })
    expect(parseAccountForm(form({ ...valid, whatsapp: 'other', whatsappNumero: '81 99900-0001' }), PHONE)).toMatchObject({
      ok: false,
      errors: { whatsapp: expect.stringContaining('mesmo número') },
    })
  })

  it('CPF e nascimento nunca entram no payload, mesmo se enviados', () => {
    const result = parseAccountForm(form({ ...valid, cpf: '12345678909', nascimento: '1980-01-01' }), PHONE)
    expect(result.ok && Object.keys(result.payload).sort()).toEqual(['city', 'gender', 'name', 'phone_is_whatsapp', 'state_code', 'whatsapp_number'])
  })
})

describe('parseProfileForm', () => {
  const base = { nome: ' Artista X ', cidade: 'Recife', estado: 'PE', descricao: '**bio**', usarCor: 'on', cor: '#00FF88', instagram: 'https://instagram.com/x', site: 'https://example.invalid' }

  it('artista: monta o payload com redes (site -> website), cor, publicação e estilos', () => {
    const result = parseProfileForm(form({ ...base, publicado: 'on', estilo: ['techno', encodeStyle('house', 'acid house'), 'techno'] }), 'artista')
    expect(result).toEqual({
      ok: true,
      payload: {
        name: 'Artista X',
        description: '**bio**',
        city: 'Recife',
        state_code: 'PE',
        color: '#00ff88',
        social_links: { instagram: 'https://instagram.com/x', website: 'https://example.invalid' },
        published: true,
        // O subestilo escolhido leva o estilo principal dele junto.
        styles: [{ style: 'techno', substyle: null }, { style: 'house', substyle: 'acid house' }, { style: 'house', substyle: null }],
      },
    })
    expect(parseProfileForm(form({ ...base, estilo: 'techno' }), 'artista')).toMatchObject({ ok: true, payload: { published: false } })
  })

  it('outras atuações não enviam publicação nem estilos; sem cor personalizada vira nulo', () => {
    const result = parseProfileForm(form({ nome: 'Serviços', cidade: 'Recife', estado: 'PE', estilo: 'techno', publicado: 'on' }), 'servicos')
    expect(result).toEqual({
      ok: true,
      payload: { name: 'Serviços', description: '', city: 'Recife', state_code: 'PE', color: null, social_links: {} },
    })
  })

  it('valida campos e guarda o que foi digitado, inclusive os estilos marcados', () => {
    const result = parseProfileForm(
      form({ nome: '', cidade: '', estado: 'ZZ', descricao: 'x'.repeat(10001), usarCor: 'on', cor: 'verde', instagram: '@x', youtube: 'youtube.com/x', publicado: 'on' }),
      'artista',
    )
    expect(result).toEqual({
      ok: false,
      errors: {
        nome: 'Informe o nome da atuação.',
        descricao: 'Use até 10.000 caracteres.',
        cidade: 'Escolha a cidade.',
        estado: 'Escolha o estado.',
        cor: 'Escolha uma cor válida.',
        instagram: 'Informe o endereço completo, começando por https://',
        youtube: 'Informe o endereço completo, começando por https://',
        estilo: 'Escolha ao menos um estilo.',
      },
      values: expect.objectContaining({ instagram: '@x', usarCor: 'on', publicado: 'on', estilo: [] }),
    })
  })

  it('limita a 50 estilos', () => {
    const many = Array.from({ length: 51 }, (_, index) => `estilo ${index}`)
    expect(parseProfileForm(form({ ...base, estilo: many }), 'artista')).toMatchObject({ ok: false, errors: { estilo: 'Escolha no máximo 50 estilos.' } })
  })
})

describe('parseProfessionalForm', () => {
  it('artista: e-mails, telefone, cachê em reais -> centavos, CNPJ e presskit; vazio vira nulo', () => {
    const result = parseProfessionalForm(
      form({ emailBooking: 'booking@example.invalid', emailContato: '', telefoneContato: '81 97777-6666', cache: 'R$ 1.500,50', cnpj: '12.abc.345/01de-35', presskit: 'https://example.invalid/kit' }),
      'artista',
    )
    expect(result).toEqual({
      ok: true,
      payload: {
        booking_email: 'booking@example.invalid',
        contact_email: null,
        contact_phone: '+5581977776666',
        fee_cents: 150050,
        cnpj: '12ABC34501DE35',
        presskit_url: 'https://example.invalid/kit',
      },
    })
    expect(parseProfessionalForm(form({}), 'artista')).toEqual({
      ok: true,
      payload: { booking_email: null, contact_email: null, contact_phone: null, fee_cents: null, cnpj: null, presskit_url: null },
    })
  })

  it('serviços: tipo "outros" exige descrição; os demais zeram a descrição', () => {
    expect(parseProfessionalForm(form({ tipoServico: 'other', servicoOutro: ' Cenografia ' }), 'servicos')).toMatchObject({
      ok: true,
      payload: { service_type: 'other', service_other: 'Cenografia' },
    })
    expect(parseProfessionalForm(form({ tipoServico: 'sound', servicoOutro: 'resto' }), 'servicos')).toMatchObject({
      ok: true,
      payload: { service_type: 'sound', service_other: null },
    })
    expect(parseProfessionalForm(form({ tipoServico: 'other' }), 'servicos')).toMatchObject({ ok: false, errors: { servicoOutro: 'Descreva o serviço.' } })
    expect(parseProfessionalForm(form({ tipoServico: 'cenografia' }), 'servicos')).toMatchObject({ ok: false, errors: { tipoServico: expect.any(String) } })
  })

  it('audiovisual: portfólio e tipo; campos de artista são ignorados', () => {
    const result = parseProfessionalForm(form({ tipoAudiovisual: 'video', portfolio: 'https://example.invalid/p', cache: '10,00', emailBooking: 'x@example.invalid' }), 'audiovisual')
    expect(result).toEqual({
      ok: true,
      payload: { contact_email: null, contact_phone: null, cnpj: null, portfolio_url: 'https://example.invalid/p', audiovisual_type: 'video' },
    })
    expect(parseProfessionalForm(form({ tipoAudiovisual: 'drone' }), 'audiovisual')).toMatchObject({ ok: false, errors: { tipoAudiovisual: expect.any(String) } })
  })

  it('erros por campo: e-mail, telefone, cachê, URL e CNPJ', () => {
    const result = parseProfessionalForm(
      form({ emailBooking: 'sem-arroba', emailContato: 'a b@example.invalid', telefoneContato: '123', cache: '1.50', cnpj: '123', presskit: 'kit.pdf' }),
      'artista',
    )
    expect(result).toMatchObject({
      ok: false,
      errors: {
        emailBooking: 'Informe um e-mail válido.',
        emailContato: 'Informe um e-mail válido.',
        telefoneContato: expect.stringContaining('telefone válido'),
        cache: expect.stringContaining('R$ 1.500,00'),
        cnpj: expect.stringContaining('CNPJ'),
        presskit: 'Informe o endereço completo, começando por https://',
      },
      values: expect.objectContaining({ cache: '1.50' }),
    })
  })
})

describe('formulários de segurança', () => {
  it('senha: exige atual, tamanho, diferença e confirmação; nunca devolve valores', () => {
    expect(parsePasswordForm(form({ atual: 'senha-atual-1', nova: 'senha-nova-12', conf: 'senha-nova-12' }))).toEqual({
      ok: true,
      payload: { current: 'senha-atual-1', next: 'senha-nova-12' },
    })
    expect(parsePasswordForm(form({ atual: '', nova: 'curta', conf: 'outra' }))).toEqual({
      ok: false,
      errors: { atual: 'Informe a senha atual.', nova: 'Use ao menos 8 caracteres.', conf: 'As senhas não coincidem.' },
      values: {},
    })
    expect(parsePasswordForm(form({ atual: 'mesma-senha-1', nova: 'mesma-senha-1', conf: 'mesma-senha-1' }))).toMatchObject({ ok: false, errors: { nova: expect.stringContaining('diferente') } })
    expect(parsePasswordForm(form({ atual: 'a', nova: 'x'.repeat(73), conf: 'x'.repeat(73) }))).toMatchObject({ ok: false, errors: { nova: expect.stringContaining('72') } })
  })

  it('e-mail: formato válido e diferente do atual (sem diferenciar maiúsculas)', () => {
    expect(parseEmailForm(form({ email: ' novo@example.invalid ' }), 'velho@example.invalid')).toEqual({ ok: true, payload: { email: 'novo@example.invalid' } })
    expect(parseEmailForm(form({ email: 'sem-arroba' }), null)).toMatchObject({ ok: false, errors: { email: 'Informe um e-mail válido.' } })
    expect(parseEmailForm(form({ email: 'VELHO@example.invalid' }), 'velho@example.invalid')).toMatchObject({ ok: false, errors: { email: 'Este já é o e-mail da conta.' } })
  })

  it('código MFA: 6 dígitos (espaços tolerados) e id de fator válido', () => {
    const factorId = '0b4f2d1c-aaaa-4bbb-8ccc-123456789012'
    expect(parseMfaCode(form({ factorId, codigo: '123 456' }))).toEqual({ ok: true, payload: { factorId, code: '123456' } })
    expect(parseMfaCode(form({ factorId, codigo: '12345' }))).toMatchObject({ ok: false, errors: { codigo: expect.stringContaining('6 dígitos') } })
    expect(parseMfaCode(form({ factorId: 'x', codigo: '123456' }))).toMatchObject({ ok: false, errors: { codigo: expect.stringContaining('inválido') } })
  })

  it('confirmação digitada: exata, sem diferenciar espaços nas pontas', () => {
    expect(parseConfirmation(form({ confirmacao: ` ${CONFIRM_DELETE_ACCOUNT} ` }), CONFIRM_DELETE_ACCOUNT).ok).toBe(true)
    expect(parseConfirmation(form({ confirmacao: CONFIRM_DELETE_PROFILE }), CONFIRM_DELETE_PROFILE).ok).toBe(true)
    expect(parseConfirmation(form({ confirmacao: 'excluir' }), CONFIRM_DELETE_PROFILE)).toMatchObject({ ok: false, errors: { confirmacao: expect.stringContaining('EXCLUIR') } })
    expect(parseConfirmation(form({}), CONFIRM_DELETE_ACCOUNT).ok).toBe(false)
  })
})
