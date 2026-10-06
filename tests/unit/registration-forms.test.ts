import { describe, expect, it } from 'vitest'
import {
  formatBrazilianPhone,
  normalizeBrazilianMobile,
  parseCodeForm,
  parseNewProfileForm,
  parsePhoneForm,
  parseProfileFields,
  parseRegistrationForm,
  parseResendEmailForm,
  parseSignupForm,
  registrationStep,
} from '../../src/lib/registration-forms'

const form = (fields: Record<string, string | string[]>) => {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(fields)) for (const item of Array.isArray(value) ? value : [value]) params.append(key, item)
  return params
}
const REQUEST_ID = '0b4f2d1c-aaaa-4bbb-8ccc-123456789012'
const TODAY = new Date('2026-10-07T15:00:00Z')

describe('registrationStep: etapa a partir do estado real do Auth', () => {
  it('sem sessão: criar a conta', () => {
    expect(registrationStep(null)).toBe('account')
    expect(registrationStep(undefined)).toBe('account')
  })
  it('e-mail não confirmado: esperar a confirmação, mesmo que haja celular', () => {
    expect(registrationStep({ email_confirmed_at: null })).toBe('email')
    expect(registrationStep({ email_confirmed_at: null, phone_confirmed_at: '2026-01-01T00:00:00Z' })).toBe('email')
  })
  it('e-mail confirmado: celular, ou o código quando há envio pendente', () => {
    expect(registrationStep({ email_confirmed_at: 'x' })).toBe('phone')
    expect(registrationStep({ email_confirmed_at: 'x', new_phone: '' })).toBe('phone')
    expect(registrationStep({ email_confirmed_at: 'x', new_phone: '5581999900001' })).toBe('code')
  })
  it('e-mail e celular confirmados: dados e atuação', () => {
    expect(registrationStep({ email_confirmed_at: 'x', phone_confirmed_at: 'y' })).toBe('data')
    // Um novo envio pendente não faz voltar: o celular já confirmado vale.
    expect(registrationStep({ email_confirmed_at: 'x', phone_confirmed_at: 'y', new_phone: '5581999900002' })).toBe('data')
  })
})

describe('conta', () => {
  const valid = { email: ' nova@example.invalid ', senha: 'senha-segura-1', conf: 'senha-segura-1' }
  it('aceita e-mail e senha válidos (e apara o e-mail)', () => {
    expect(parseSignupForm(form(valid))).toEqual({ ok: true, payload: { email: 'nova@example.invalid', password: 'senha-segura-1' } })
  })
  it('recusa e-mail inválido, senha curta/longa e confirmação diferente, devolvendo só o e-mail', () => {
    const result = parseSignupForm(form({ email: 'sem-arroba', senha: 'curta', conf: 'outra' }))
    expect(result).toMatchObject({ ok: false, errors: { email: expect.any(String), senha: 'Use ao menos 8 caracteres.', conf: 'As senhas não coincidem.' }, values: { email: 'sem-arroba' } })
    expect(JSON.stringify(result)).not.toContain('curta')
    expect(parseSignupForm(form({ ...valid, senha: 'x'.repeat(73), conf: 'x'.repeat(73) }))).toMatchObject({ ok: false, errors: { senha: expect.stringContaining('72') } })
  })
  it('reenvio do e-mail valida o endereço', () => {
    expect(parseResendEmailForm(form({ email: 'a@example.invalid' }))).toEqual({ ok: true, payload: { email: 'a@example.invalid' } })
    expect(parseResendEmailForm(form({ email: '' }))).toMatchObject({ ok: false, errors: { email: expect.any(String) } })
  })
})

describe('celular', () => {
  it('só celular brasileiro (DDD + 9 dígitos), com ou sem +55 e máscara', () => {
    for (const input of ['81 99999-0001', '(81) 99999-0001', '81999990001', '+55 81 99999-0001', '5581999990001'])
      expect(normalizeBrazilianMobile(input)).toBe('+5581999990001')
    for (const input of ['', '81 3333-0001', '999990001', '+1 415 555 0100', '+5581999', 'abc'])
      expect(normalizeBrazilianMobile(input)).toBeNull()
  })
  it('formulário do celular devolve o E-164 ou o erro com o valor digitado', () => {
    expect(parsePhoneForm(form({ telefone: '81 99999-0001' }))).toEqual({ ok: true, payload: { phone: '+5581999990001' } })
    expect(parsePhoneForm(form({ telefone: '123' }))).toMatchObject({ ok: false, errors: { telefone: expect.any(String) }, values: { telefone: '123' } })
  })
  it('código de 6 dígitos (aceita espaços)', () => {
    expect(parseCodeForm(form({ codigo: '123 456' }))).toEqual({ ok: true, payload: { code: '123456' } })
    for (const codigo of ['', '12345', '1234567', 'abcdef']) expect(parseCodeForm(form({ codigo }))).toMatchObject({ ok: false, errors: { codigo: expect.any(String) } })
  })
  it('formata o celular para exibição', () => {
    expect(formatBrazilianPhone('+5581999990001')).toBe('+55 (81) 99999-0001')
    expect(formatBrazilianPhone('+14155550100')).toBe('+14155550100')
  })
})

describe('atuação', () => {
  it('mapeia o tipo da tela para o do banco; artista leva estilos e subestilos', () => {
    expect(parseProfileFields(form({ tipo: 'artista', atuacaoNome: ' DJ Teste ', estilo: ['techno', 'house|deep house', 'techno'] }))).toEqual({
      ok: true,
      payload: { kind: 'artist', name: 'DJ Teste', styles: [{ style: 'techno', substyle: null }, { style: 'house', substyle: 'deep house' }] },
    })
    expect(parseProfileFields(form({ tipo: 'servicos', atuacaoNome: 'Som & Luz', estilo: 'techno' }))).toEqual({ ok: true, payload: { kind: 'services', name: 'Som & Luz' } })
    expect(parseProfileFields(form({ tipo: 'audiovisual', atuacaoNome: 'Estúdio' }))).toMatchObject({ ok: true, payload: { kind: 'audiovisual' } })
  })
  it('artista exige estilo; tipo e nome são obrigatórios; o nome tem limite', () => {
    expect(parseProfileFields(form({ tipo: 'artista', atuacaoNome: 'DJ' }))).toMatchObject({ ok: false, errors: { estilo: 'Escolha ao menos um estilo.' } })
    expect(parseProfileFields(form({}))).toMatchObject({ ok: false, errors: { tipo: expect.any(String), atuacaoNome: expect.any(String) } })
    expect(parseProfileFields(form({ tipo: 'servicos', atuacaoNome: 'x'.repeat(201) }))).toMatchObject({ ok: false, errors: { atuacaoNome: expect.stringContaining('200') } })
    expect(parseProfileFields(form({ tipo: 'artista', atuacaoNome: 'DJ', estilo: Array.from({ length: 51 }, (_, i) => `e${i}`) }))).toMatchObject({ ok: false, errors: { estilo: expect.stringContaining('50') } })
  })
  it('integrante sem nome usa o nome da pessoa', () => {
    expect(parseProfileFields(form({ tipo: 'integrante' }), 'Pessoa Teste')).toEqual({ ok: true, payload: { kind: 'member', name: 'Pessoa Teste' } })
    expect(parseProfileFields(form({ tipo: 'integrante' }))).toMatchObject({ ok: false, errors: { atuacaoNome: expect.any(String) } })
    expect(parseNewProfileForm(form({ tipo: 'integrante' }), 'Fulana')).toMatchObject({ ok: true, payload: { name: 'Fulana' } })
  })
  it('devolve o que foi digitado quando há erro', () => {
    expect(parseProfileFields(form({ tipo: 'artista', atuacaoNome: 'DJ', estilo: ['techno'], nada: 'x' }))).toMatchObject({ ok: true })
    expect(parseProfileFields(form({ tipo: 'artista', atuacaoNome: '', estilo: ['techno'] }))).toMatchObject({ ok: false, values: { tipo: 'artista', atuacaoNome: '', estilo: ['techno'] } })
  })
})

describe('dados do cadastro', () => {
  const valid = {
    nome: ' Pessoa Teste ', cpf: '529.982.247-25', nascimento: '1990-05-20', genero: '', cidade: ' Recife ', estado: 'PE',
    whatsapp: 'same', tipo: 'servicos', atuacaoNome: 'Som & Luz', requestId: REQUEST_ID,
  }
  const parse = (extra: Record<string, string | string[]> = {}, phone = '+5581999990001') => parseRegistrationForm(form({ ...valid, ...extra }), phone, TODAY)

  it('monta a conta e a primeira atuação para o RPC, com o CPF só em dígitos', () => {
    expect(parse()).toEqual({
      ok: true,
      payload: {
        account: { name: 'Pessoa Teste', cpf: '52998224725', birth_date: '1990-05-20', gender: null, city: 'Recife', state_code: 'PE', phone_is_whatsapp: true, whatsapp_number: null },
        profile: { kind: 'services', name: 'Som & Luz' },
        requestId: REQUEST_ID,
      },
    })
  })
  it('RN-03/RN-31: CPF válido e 18 anos completos', () => {
    expect(parse({ cpf: '111.111.111-11' })).toMatchObject({ ok: false, errors: { cpf: 'Informe um CPF válido.' } })
    expect(parse({ cpf: '' })).toMatchObject({ ok: false, errors: { cpf: 'Informe o CPF.' } })
    expect(parse({ nascimento: '2010-01-01' })).toMatchObject({ ok: false, errors: { nascimento: 'É necessário ter 18 anos completos.' } })
    expect(parse({ nascimento: '2008-10-08' })).toMatchObject({ ok: false, errors: { nascimento: 'É necessário ter 18 anos completos.' } })
    expect(parse({ nascimento: '2008-10-07' })).toMatchObject({ ok: true })
    expect(parse({ nascimento: '1990-02-31' })).toMatchObject({ ok: false, errors: { nascimento: 'Informe uma data de nascimento válida.' } })
    expect(parse({ nascimento: '' })).toMatchObject({ ok: false, errors: { nascimento: 'Informe a data de nascimento.' } })
  })
  it('RN-04: nome, cidade, UF; gênero é opcional', () => {
    expect(parse({ nome: '', cidade: '', estado: 'XX' })).toMatchObject({ ok: false, errors: { nome: expect.any(String), cidade: expect.any(String), estado: expect.any(String) } })
    expect(parse({ genero: 'Pessoa não binária' })).toMatchObject({ ok: true, payload: { account: { gender: 'Pessoa não binária' } } })
    expect(parse({ genero: 'x'.repeat(101) })).toMatchObject({ ok: false, errors: { genero: expect.any(String) } })
  })
  it('RN-36: WhatsApp igual ao celular, outro número válido, ou nenhum', () => {
    expect(parse({ whatsapp: 'none' })).toMatchObject({ ok: true, payload: { account: { phone_is_whatsapp: false, whatsapp_number: null } } })
    expect(parse({ whatsapp: 'other', whatsappNumero: '81 98888-7777' })).toMatchObject({
      ok: true, payload: { account: { phone_is_whatsapp: false, whatsapp_number: '+5581988887777' } },
    })
    expect(parse({ whatsapp: 'other', whatsappNumero: '' })).toMatchObject({ ok: false, errors: { whatsappNumero: expect.any(String) } })
    expect(parse({ whatsapp: 'other', whatsappNumero: '81 99999-0001' })).toMatchObject({ ok: false, errors: { whatsapp: expect.stringContaining('mesmo número') } })
    expect(parse({ whatsapp: '' })).toMatchObject({ ok: false, errors: { whatsapp: 'Escolha uma opção.' } })
  })
  it('identificador do formulário obrigatório (UUID); erros da atuação entram junto', () => {
    expect(parse({ requestId: 'nada' })).toMatchObject({ ok: false, errors: { requestId: expect.any(String) } })
    expect(parse({ tipo: 'artista' })).toMatchObject({ ok: false, errors: { estilo: expect.any(String) } })
    expect(parse({ tipo: '' })).toMatchObject({ ok: false, errors: { tipo: expect.any(String) } })
  })
  it('integrante de coletivo sem nome da atuação usa o nome da conta', () => {
    expect(parse({ tipo: 'integrante', atuacaoNome: '' })).toMatchObject({ ok: true, payload: { profile: { kind: 'member', name: 'Pessoa Teste' } } })
  })
  it('em erro devolve o digitado, sem o requestId nem o telefone', () => {
    const result = parse({ cpf: '1', tipo: 'artista', estilo: ['techno'] })
    expect(result).toMatchObject({ ok: false, values: { nome: ' Pessoa Teste '.trim(), cpf: '1', tipo: 'artista', estilo: ['techno'] } })
    expect(JSON.stringify(result)).not.toContain(REQUEST_ID)
  })
})
