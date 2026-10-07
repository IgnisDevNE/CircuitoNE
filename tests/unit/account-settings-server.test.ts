// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  accountDataAction,
  cancelMfa,
  changeEmail,
  changePassword,
  elevateMfa,
  enrollMfa,
  enrollmentFromForm,
  loadAccountData,
  loadProfileEdit,
  loadSecurity,
  profileAction,
  removeMfa,
  removeProfile,
  requestDeletion,
  saveAccount,
  saveProfessional,
  saveProfile,
  securityAction,
  verifyMfa,
  type Outcome,
  type PasswordVerifier,
} from '../../src/server/account-settings.server'
import type { ActionResult } from '../../src/lib/account-forms'
import { mapMyProfile } from '../../src/server/mappers/account-settings'
import { loginAction } from '../../src/server/auth.server'
import type { SupabaseServerClient } from '../../src/server/supabase.server'

type Result = { data: unknown; error: unknown }
const ok = (data: unknown = null): Result => ({ data, error: null })
const failure = (code: string, message = 'interno', status?: number): Result => ({ data: null, error: { code, message, status } })

const form = (fields: Record<string, string | string[]>) => {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(fields)) for (const item of Array.isArray(value) ? value : [value]) params.append(key, item)
  return params
}

const ID = '02000000-0000-4000-8000-000000000001'
const FACTOR = '0b4f2d1c-aaaa-4bbb-8ccc-123456789012'

const account = (extra = {}) => ({
  name: 'Pessoa A sintética', cpf_masked: '***.982.247-**', birth_date: '1990-01-01', gender: null, city: 'Recife', state_code: 'PE',
  email: 'a@example.invalid', phone: '+5581999000001', phone_is_whatsapp: true, whatsapp_number: null, ...extra,
})
const profile = (extra = {}) => ({
  id: ID, kind: 'artist', name: 'Artista', description: '', city: 'Recife', state_code: 'PE', social_links: {}, color: null, published: false,
  is_default: false, styles: [{ style: 'techno', substyle: null }],
  professional: { booking_email: null, contact_email: null, contact_phone: null, fee_cents: null, cnpj: null, service_type: null, service_other: null, audiovisual_type: null, presskit_url: null, portfolio_url: null },
  ...extra,
})
const artist = () => mapMyProfile(profile())!
const services = () => mapMyProfile(profile({ kind: 'services', styles: [] }))!
const member = () => mapMyProfile(profile({ kind: 'member', styles: [], professional: null }))!

/** Fake client: RPCs, `from(...).select()` e a API de Auth que as funções do servidor usam. */
function fakeClient(opts: {
  rpc?: Record<string, Result>
  tables?: Record<string, Result>
  user?: { email?: string; new_email?: string } | null
  userError?: unknown
  updateUser?: { error: unknown }
  factors?: { all: unknown[]; totp: unknown[] } | null
  level?: { currentLevel: string; nextLevel: string }
  enroll?: Result
  verify?: { error: unknown }
  unenroll?: { error: unknown }
} = {}) {
  const rpc = vi.fn(async (name: string) => {
    const entry = opts.rpc?.[name]
    if (!entry) throw new Error(`rpc inesperado: ${name}`)
    return entry
  })
  const from = vi.fn((table: string) => ({
    select: vi.fn(async () => {
      const entry = opts.tables?.[table]
      if (!entry) throw new Error(`tabela inesperada: ${table}`)
      return entry
    }),
  }))
  const auth = {
    getUser: vi.fn(async () => ({
      data: { user: opts.user === undefined ? { email: 'a@example.invalid' } : opts.user },
      error: opts.userError ?? null,
    })),
    updateUser: vi.fn(async () => opts.updateUser ?? { data: {}, error: null }),
    mfa: {
      listFactors: vi.fn(async () =>
        opts.factors === null ? { data: null, error: { message: 'x' } } : { data: opts.factors ?? { all: [], totp: [] }, error: null },
      ),
      getAuthenticatorAssuranceLevel: vi.fn(async () => ({ data: opts.level ?? { currentLevel: 'aal1', nextLevel: 'aal1' }, error: null })),
      enroll: vi.fn(async () => opts.enroll ?? ok({ id: FACTOR, type: 'totp', totp: { qr_code: '<svg/>', secret: 'JBSWY3DPEHPK3PXP', uri: 'otpauth://totp/CircuitoNE:a?secret=JBSWY3DPEHPK3PXP' } })),
      challengeAndVerify: vi.fn(async () => opts.verify ?? { data: {}, error: null }),
      unenroll: vi.fn(async () => opts.unenroll ?? { data: {}, error: null }),
    },
  }
  return { client: { rpc, from, auth } as unknown as SupabaseServerClient, rpc, from, auth }
}

const resultOf = (outcome: Outcome) => {
  if (!('result' in outcome)) throw new Error('esperava resultado, veio ' + JSON.stringify(outcome))
  return outcome
}
const failed = (outcome: Outcome) => {
  const { result, status } = resultOf(outcome)
  if (result.ok) throw new Error('esperava falha')
  return { ...result, status }
}
const succeeded = (outcome: Outcome) => {
  const { result, status } = resultOf(outcome)
  if (!result.ok) throw new Error('esperava sucesso: ' + JSON.stringify(result))
  return { ...result, status }
}

describe('loaders', () => {
  it('dados da conta: mapeia; conta restrita (nulo) devolve vazio; falha do banco é 503', async () => {
    expect((await loadAccountData(fakeClient({ rpc: { get_my_account_details: ok(account()) } }).client)).conta).toMatchObject({ nome: 'Pessoa A sintética', cpfMascarado: '***.982.247-**' })
    expect(await loadAccountData(fakeClient({ rpc: { get_my_account_details: ok(null) } }).client)).toEqual({ conta: null })
    await expect(loadAccountData(fakeClient({ rpc: { get_my_account_details: failure('PGRST000') } }).client)).rejects.toMatchObject({ status: 503 })
    await expect(loadAccountData(fakeClient({ rpc: { get_my_account_details: ok({ ...account(), state_code: 'XX' }) } }).client)).rejects.toThrow()
  })

  it('edição de atuação: artista traz a taxonomia; outros tipos não a consultam', async () => {
    const tables = { music_styles: ok([{ name: 'techno' }]), music_substyles: ok([{ style: 'techno', name: 'acid techno' }]) }
    const a = fakeClient({ rpc: { get_my_profile: ok(profile()) }, tables })
    expect(await loadProfileEdit(a.client, ID)).toMatchObject({ perfil: { nome: 'Artista', tipo: 'artista' }, taxonomia: [{ estilo: 'techno', subestilos: ['acid techno'] }] })
    const s = fakeClient({ rpc: { get_my_profile: ok(profile({ kind: 'services', styles: [] })) } })
    expect(await loadProfileEdit(s.client, ID)).toMatchObject({ perfil: { tipo: 'servicos' }, taxonomia: [] })
    expect(s.from).not.toHaveBeenCalled()
  })

  it('atuação inexistente, de outra conta ou com id inválido: 404 (sem distinguir)', async () => {
    const invalid = fakeClient()
    await expect(loadProfileEdit(invalid.client, 'nao-e-uuid')).rejects.toMatchObject({ status: 404 })
    expect(invalid.rpc).not.toHaveBeenCalled()
    const foreign = fakeClient({ rpc: { get_my_profile: ok(null), get_account_session: ok({ id: 'A', state: 'active' }) } })
    await expect(loadProfileEdit(foreign.client, ID)).rejects.toMatchObject({ status: 404 })
  })

  it('conta restrita não vira 404: devolve vazio e o layout mostra o aviso', async () => {
    const restricted = fakeClient({ rpc: { get_my_profile: ok(null), get_account_session: ok({ id: 'A', state: 'suspended' }) } })
    expect(await loadProfileEdit(restricted.client, ID)).toEqual({ perfil: null, taxonomia: [] })
    await expect(loadProfileEdit(fakeClient({ rpc: { get_my_profile: failure('PGRST000') } }).client, ID)).rejects.toMatchObject({ status: 503 })
  })

  it('segurança: e-mail, e-mail pendente, fatores verificados e confirmação de sessão pendente', async () => {
    const factors = { all: [], totp: [{ id: FACTOR, friendly_name: 'App autenticador x', created_at: '2026-10-01T00:00:00Z' }] }
    const normal = await loadSecurity(fakeClient({ user: { email: 'a@example.invalid', new_email: 'novo@example.invalid' }, factors, level: { currentLevel: 'aal2', nextLevel: 'aal2' } }).client)
    expect(normal.seguranca).toEqual({
      email: 'a@example.invalid', emailPendente: 'novo@example.invalid',
      fatores: [{ id: FACTOR, nome: 'App autenticador x', criadoEm: '2026-10-01T00:00:00Z' }], precisaConfirmar: false,
    })
    expect((await loadSecurity(fakeClient({ factors, level: { currentLevel: 'aal1', nextLevel: 'aal2' } }).client)).seguranca?.precisaConfirmar).toBe(true)
    expect((await loadSecurity(fakeClient().client)).seguranca).toMatchObject({ fatores: [], precisaConfirmar: false, emailPendente: null })
  })

  it('segurança: sem sessão é vazio; falha do Auth é 503', async () => {
    expect(await loadSecurity(fakeClient({ user: null, userError: { name: 'AuthSessionMissingError', status: 400 } }).client)).toEqual({ seguranca: null })
    await expect(loadSecurity(fakeClient({ user: null, userError: { status: 502 } }).client)).rejects.toMatchObject({ status: 503 })
    await expect(loadSecurity(fakeClient({ user: null, userError: { name: 'AuthRetryableFetchError', status: 0 } }).client)).rejects.toMatchObject({ status: 503 })
    await expect(loadSecurity(fakeClient({ factors: null }).client)).rejects.toMatchObject({ status: 503 })
  })
})

describe('saveAccount', () => {
  const valid = { nome: 'Pessoa Nova', cidade: 'Olinda', estado: 'PE', whatsapp: 'other', whatsappNumero: '81 98888-7777' }

  it('valida antes de gravar: erro por campo, nenhuma escrita', async () => {
    const { client, rpc } = fakeClient({ rpc: { get_my_account_details: ok(account()) } })
    const outcome = failed(await saveAccount(client, form({ ...valid, nome: '', estado: 'XX' })))
    expect(outcome).toMatchObject({ intent: 'save-account', status: 400, errors: { nome: expect.any(String), estado: expect.any(String) }, values: expect.objectContaining({ cidade: 'Olinda' }) })
    expect(rpc).not.toHaveBeenCalledWith('update_my_account_details', expect.anything())
  })

  it('sucesso só depois do RPC: envia o payload validado, sem CPF nem nascimento', async () => {
    const { client, rpc } = fakeClient({ rpc: { get_my_account_details: ok(account()), update_my_account_details: ok() } })
    expect(succeeded(await saveAccount(client, form({ ...valid, cpf: '12345678909', nascimento: '1980-01-01' })))).toMatchObject({ intent: 'save-account', message: 'Dados atualizados.', status: 200 })
    expect(rpc).toHaveBeenCalledWith('update_my_account_details', {
      payload: { name: 'Pessoa Nova', gender: null, city: 'Olinda', state_code: 'PE', phone_is_whatsapp: false, whatsapp_number: '+5581988887777' },
    })
  })

  it('erros do banco: mensagem própria (22023), 403 (42501) ou genérico (503); sem sucesso falso', async () => {
    const base = { get_my_account_details: ok(account()) }
    expect(failed(await saveAccount(fakeClient({ rpc: { ...base, update_my_account_details: failure('22023', 'Dados da conta inválidos') } }).client, form(valid)))).toMatchObject({ message: 'Dados da conta inválidos', status: 400 })
    expect(failed(await saveAccount(fakeClient({ rpc: { ...base, update_my_account_details: failure('42501', 'Conta indisponível') } }).client, form(valid)))).toMatchObject({ status: 403 })
    const unknown = failed(await saveAccount(fakeClient({ rpc: { ...base, update_my_account_details: failure('XX000', 'detalhe interno do banco') } }).client, form(valid)))
    expect(unknown).toMatchObject({ status: 503 })
    expect(JSON.stringify(unknown)).not.toContain('detalhe interno')
    expect(failed(await saveAccount(fakeClient({ rpc: { get_my_account_details: ok(null) } }).client, form(valid)))).toMatchObject({ status: 403 })
  })
})

describe('saveProfile / saveProfessional / removeProfile', () => {
  const profileForm = { nome: 'Artista Novo', cidade: 'Recife', estado: 'PE', descricao: 'bio', usarCor: 'on', cor: '#00ff88', publicado: 'on', estilo: ['techno', 'house|acid house'], instagram: 'https://instagram.com/x' }

  it('perfil de artista: um único RPC com estilos e publicação', async () => {
    const { client, rpc } = fakeClient({ rpc: { update_my_profile: ok() } })
    expect(succeeded(await saveProfile(client, artist(), form(profileForm)))).toMatchObject({ intent: 'save-profile', message: 'Perfil atualizado.' })
    expect(rpc).toHaveBeenCalledWith('update_my_profile', {
      target: ID,
      payload: {
        name: 'Artista Novo', description: 'bio', city: 'Recife', state_code: 'PE', color: '#00ff88', social_links: { instagram: 'https://instagram.com/x' },
        published: true, styles: [{ style: 'techno', substyle: null }, { style: 'house', substyle: 'acid house' }],
      },
    })
  })

  it('perfil de serviços não envia publicação nem estilos; validação não chama o banco', async () => {
    const { client, rpc } = fakeClient({ rpc: { update_my_profile: ok() } })
    await saveProfile(client, services(), form(profileForm))
    expect(rpc).toHaveBeenCalledWith('update_my_profile', { target: ID, payload: expect.not.objectContaining({ published: expect.anything(), styles: expect.anything() }) })
    const invalid = fakeClient({ rpc: {} })
    expect(failed(await saveProfile(invalid.client, artist(), form({ ...profileForm, estilo: [], nome: '' })))).toMatchObject({ errors: { nome: expect.any(String), estilo: expect.any(String) } })
    expect(invalid.rpc).not.toHaveBeenCalled()
  })

  it('erro do banco no perfil mostra a mensagem própria', async () => {
    const { client } = fakeClient({ rpc: { update_my_profile: failure('22023', 'Estilo musical inválido') } })
    expect(failed(await saveProfile(client, artist(), form(profileForm)))).toMatchObject({ intent: 'save-profile', message: 'Estilo musical inválido', status: 400 })
  })

  it('dados profissionais: cachê em centavos; integrante não tem; erros por campo', async () => {
    const { client, rpc } = fakeClient({ rpc: { update_my_professional_details: ok() } })
    expect(succeeded(await saveProfessional(client, artist(), form({ cache: 'R$ 1.500,00', emailBooking: 'b@example.invalid' })))).toMatchObject({ intent: 'save-professional' })
    expect(rpc).toHaveBeenCalledWith('update_my_professional_details', {
      target: ID, payload: expect.objectContaining({ fee_cents: 150000, booking_email: 'b@example.invalid' }),
    })
    const other = fakeClient({ rpc: {} })
    expect(failed(await saveProfessional(other.client, member(), form({})))).toMatchObject({ message: expect.stringContaining('não tem dados profissionais') })
    expect(failed(await saveProfessional(other.client, artist(), form({ cache: 'caro' })))).toMatchObject({ errors: { cache: expect.any(String) } })
    expect(other.rpc).not.toHaveBeenCalled()
  })

  it('excluir atuação: exige confirmação digitada; sucesso redireciona; erro do banco não redireciona', async () => {
    const wrong = fakeClient({ rpc: {} })
    expect(failed(await removeProfile(wrong.client, artist(), form({ confirmacao: 'excluir' })))).toMatchObject({ intent: 'delete-profile', errors: { confirmacao: expect.any(String) } })
    expect(wrong.rpc).not.toHaveBeenCalled()
    const good = fakeClient({ rpc: { delete_profile: ok() } })
    expect(await removeProfile(good.client, artist(), form({ confirmacao: 'EXCLUIR' }))).toEqual({ redirectTo: '/painel/dados' })
    expect(good.rpc).toHaveBeenCalledWith('delete_profile', { target: ID })
    expect(failed(await removeProfile(fakeClient({ rpc: { delete_profile: failure('42501') } }).client, artist(), form({ confirmacao: 'EXCLUIR' })))).toMatchObject({ status: 403 })
  })
})

describe('segurança: senha e e-mail', () => {
  const pass = { atual: 'senha-atual-1', nova: 'senha-nova-12', conf: 'senha-nova-12' }
  const verifier = (check: Awaited<ReturnType<PasswordVerifier>>) => vi.fn<PasswordVerifier>(async () => check)

  it('senha atual errada: erro no campo e nenhuma troca', async () => {
    const { client, auth } = fakeClient()
    const verify = verifier('wrong')
    expect(failed(await changePassword(client, form(pass), verify))).toMatchObject({ intent: 'change-password', errors: { atual: 'Senha atual incorreta.' }, status: 400 })
    expect(verify).toHaveBeenCalledWith('a@example.invalid', 'senha-atual-1')
    expect(auth.updateUser).not.toHaveBeenCalled()
  })

  it('validação local vem antes de qualquer chamada ao Auth', async () => {
    const { client, auth } = fakeClient()
    const verify = verifier('ok')
    expect(failed(await changePassword(client, form({ atual: '', nova: 'curta', conf: 'x' }), verify)).errors).toMatchObject({ atual: expect.any(String), nova: expect.any(String), conf: expect.any(String) })
    expect(verify).not.toHaveBeenCalled()
    expect(auth.updateUser).not.toHaveBeenCalled()
  })

  it('limite de tentativas e indisponibilidade da checagem não trocam a senha', async () => {
    const limited = fakeClient()
    expect(failed(await changePassword(limited.client, form(pass), verifier('limited')))).toMatchObject({ status: 429 })
    const down = fakeClient()
    expect(failed(await changePassword(down.client, form(pass), verifier('unavailable')))).toMatchObject({ status: 503 })
    expect(limited.auth.updateUser).not.toHaveBeenCalled()
    expect(down.auth.updateUser).not.toHaveBeenCalled()
  })

  it('sucesso só depois de updateUser sem erro; erros do Auth viram mensagens úteis', async () => {
    const good = fakeClient()
    expect(succeeded(await changePassword(good.client, form(pass), verifier('ok')))).toMatchObject({ intent: 'change-password', message: 'Senha alterada.' })
    expect(good.auth.updateUser).toHaveBeenCalledWith({ password: 'senha-nova-12' })
    const same = fakeClient({ updateUser: { error: { code: 'same_password', status: 422 } } })
    expect(failed(await changePassword(same.client, form(pass), verifier('ok')))).toMatchObject({ errors: { nova: expect.stringContaining('diferente') } })
    const weak = fakeClient({ updateUser: { error: { code: 'weak_password', status: 422 } } })
    expect(failed(await changePassword(weak.client, form(pass), verifier('ok')))).toMatchObject({ errors: { nova: expect.stringContaining('fraca') } })
    const aal = fakeClient({ updateUser: { error: { code: 'insufficient_aal', status: 403 } } })
    expect(failed(await changePassword(aal.client, form(pass), verifier('ok')))).toMatchObject({ status: 403, message: expect.stringContaining('autenticador') })
    const broken = fakeClient({ updateUser: { error: { status: 500 } } })
    expect(failed(await changePassword(broken.client, form(pass), verifier('ok')))).toMatchObject({ status: 503 })
  })

  it('e-mail: pede confirmação sem trocar nada na hora', async () => {
    const { client, auth } = fakeClient()
    const outcome = succeeded(await changeEmail(client, form({ email: 'novo@example.invalid' })))
    expect(outcome.message).toContain('novo@example.invalid')
    expect(outcome.message).toContain('só muda depois da confirmação')
    // O link do e-mail volta pelo callback do app (/auth/confirmar), que cria a sessão e redireciona.
    expect(auth.updateUser).toHaveBeenCalledWith({ email: 'novo@example.invalid' }, { emailRedirectTo: 'https://circuitone-dev.magalz.space/auth/confirmar' })
  })

  it('e-mail: inválido, igual ao atual, já usado (sem confirmar existência) e limite de envio', async () => {
    const same = fakeClient()
    expect(failed(await changeEmail(same.client, form({ email: 'A@example.invalid' }))).errors.email).toBe('Este já é o e-mail da conta.')
    expect(failed(await changeEmail(same.client, form({ email: 'x' }))).errors.email).toBe('Informe um e-mail válido.')
    expect(same.auth.updateUser).not.toHaveBeenCalled()
    const taken = failed(await changeEmail(fakeClient({ updateUser: { error: { code: 'email_exists', status: 422 } } }).client, form({ email: 'outro@example.invalid' })))
    expect(taken.message).not.toMatch(/já (está|foi)|cadastrad|existe/i)
    expect(failed(await changeEmail(fakeClient({ updateUser: { error: { code: 'over_email_send_rate_limit', status: 429 } } }).client, form({ email: 'outro@example.invalid' })))).toMatchObject({ status: 429 })
  })
})

describe('segurança: MFA TOTP', () => {
  const unverified = { id: 'old', factor_type: 'totp', status: 'unverified' }
  const verified = { id: FACTOR, factor_type: 'totp', status: 'verified' }
  const code = { factorId: FACTOR, codigo: '123456' }

  it('cadastro: descarta cadastros inacabados (só os não verificados) e devolve segredo e QR', async () => {
    const { client, auth } = fakeClient({ factors: { all: [unverified, verified, { id: 'phone', factor_type: 'phone', status: 'unverified' }], totp: [verified] } })
    const outcome = succeeded(await enrollMfa(client))
    expect(auth.mfa.unenroll).toHaveBeenCalledTimes(1)
    expect(auth.mfa.unenroll).toHaveBeenCalledWith({ factorId: 'old' })
    expect(auth.mfa.enroll).toHaveBeenCalledWith(expect.objectContaining({ factorType: 'totp', issuer: 'CircuitoNE' }))
    expect(outcome.enrollment).toEqual({
      factorId: FACTOR, secret: 'JBSWY3DPEHPK3PXP', uri: expect.stringMatching(/^otpauth:\/\/totp\//), qr: 'data:image/svg+xml;utf-8,<svg/>',
    })
  })

  it('cadastro: QR que já vem como data URI não é prefixado de novo; MFA desligada no projeto é informada', async () => {
    const uri = succeeded(await enrollMfa(fakeClient({ enroll: ok({ id: FACTOR, totp: { qr_code: 'data:image/svg+xml;utf-8,<svg/>', secret: 'JBSWY3DPEHPK3PXP', uri: 'otpauth://totp/x' } }) }).client))
    expect(uri.enrollment?.qr).toBe('data:image/svg+xml;utf-8,<svg/>')
    const off = failed(await enrollMfa(fakeClient({ enroll: failure('mfa_totp_enroll_not_enabled', 'x', 422) }).client))
    expect(off).toMatchObject({ intent: 'mfa-enroll', status: 501, message: expect.stringContaining('não está disponível') })
    expect(failed(await enrollMfa(fakeClient({ factors: null }).client))).toMatchObject({ status: 503 })
  })

  it('ativação: código certo ativa; código errado mantém o QR na tela para tentar de novo', async () => {
    const good = fakeClient()
    expect(succeeded(await verifyMfa(good.client, form(code)))).toMatchObject({ intent: 'mfa-verify', message: 'Autenticação em dois fatores ativada.' })
    expect(good.auth.mfa.challengeAndVerify).toHaveBeenCalledWith({ factorId: FACTOR, code: '123456' })
    const bad = fakeClient({ verify: { error: { code: 'mfa_verification_failed', status: 400 } } })
    const carried = { ...code, segredo: 'JBSWY3DPEHPK3PXP', uri: 'otpauth://totp/CircuitoNE:a?secret=JBSWY3DPEHPK3PXP' }
    expect(failed(await verifyMfa(bad.client, form(carried)))).toMatchObject({
      intent: 'mfa-verify', errors: { codigo: expect.stringContaining('inválido') },
      enrollment: { factorId: FACTOR, secret: 'JBSWY3DPEHPK3PXP', qr: '' },
    })
    const malformed = failed(await verifyMfa(fakeClient().client, form({ factorId: FACTOR, codigo: 'abc' })))
    expect(malformed.errors.codigo).toBeTruthy()
  })

  it('só aceita de volta o cadastro com o formato esperado (segredo base32, URI otpauth); o QR nunca volta por aqui', () => {
    const good = { factorId: FACTOR, segredo: 'JBSWY3DPEHPK3PXP', uri: 'otpauth://totp/x' }
    expect(enrollmentFromForm(form(good))).toEqual({ factorId: FACTOR, secret: 'JBSWY3DPEHPK3PXP', uri: 'otpauth://totp/x', qr: '' })
    expect(enrollmentFromForm(form({ ...good, qr: 'data:image/svg+xml;utf-8,<svg/>' }))?.qr).toBe('')
    for (const bad of [{ segredo: 'minúsculo!' }, { uri: 'https://x.invalid' }, { factorId: 'x' }, { uri: 'otpauth://totp/' + 'x'.repeat(1100) }])
      expect(enrollmentFromForm(form({ ...good, ...bad }))).toBeUndefined()
  })

  it('confirmar sessão (aal2): usa o código do fator; erro mostra no campo', async () => {
    expect(succeeded(await elevateMfa(fakeClient().client, form(code)))).toMatchObject({ intent: 'mfa-elevate' })
    expect(failed(await elevateMfa(fakeClient({ verify: { error: { code: 'mfa_verification_failed' } } }).client, form(code)))).toMatchObject({ errors: { codigo: expect.any(String) } })
  })

  it('remover: confirma o código antes de remover; sem código válido nada é removido', async () => {
    const good = fakeClient()
    expect(succeeded(await removeMfa(good.client, form(code)))).toMatchObject({ intent: 'mfa-remove', message: 'Autenticação em dois fatores removida.' })
    expect(good.auth.mfa.challengeAndVerify.mock.invocationCallOrder[0]).toBeLessThan(good.auth.mfa.unenroll.mock.invocationCallOrder[0])
    expect(good.auth.mfa.unenroll).toHaveBeenCalledWith({ factorId: FACTOR })
    const bad = fakeClient({ verify: { error: { code: 'mfa_verification_failed' } } })
    expect(failed(await removeMfa(bad.client, form(code)))).toMatchObject({ errors: { codigo: expect.any(String) } })
    expect(bad.auth.mfa.unenroll).not.toHaveBeenCalled()
    const noCode = fakeClient()
    expect(failed(await removeMfa(noCode.client, form({ factorId: FACTOR })))).toMatchObject({ errors: { codigo: expect.any(String) } })
    expect(noCode.auth.mfa.challengeAndVerify).not.toHaveBeenCalled()
    expect(failed(await removeMfa(fakeClient({ unenroll: { error: { code: 'insufficient_aal', status: 403 } } }).client, form(code)))).toMatchObject({ status: 403 })
  })

  it('cancelar: só cadastros ainda não confirmados saem sem código', async () => {
    const pending = fakeClient({ factors: { all: [{ id: FACTOR, factor_type: 'totp', status: 'unverified' }], totp: [] } })
    expect(succeeded(await cancelMfa(pending.client, form({ factorId: FACTOR })))).toMatchObject({ intent: 'mfa-cancel' })
    expect(pending.auth.mfa.unenroll).toHaveBeenCalledWith({ factorId: FACTOR })
    const active = fakeClient({ factors: { all: [{ id: FACTOR, factor_type: 'totp', status: 'verified' }], totp: [] } })
    expect(failed(await cancelMfa(active.client, form({ factorId: FACTOR })))).toMatchObject({ message: expect.stringContaining('concluído') })
    expect(active.auth.mfa.unenroll).not.toHaveBeenCalled()
    expect(failed(await cancelMfa(fakeClient().client, form({ factorId: 'x' }))).message).toBeTruthy()
  })
})

describe('requestDeletion', () => {
  const confirm = { confirmacao: 'EXCLUIR MINHA CONTA' }

  it('exige a confirmação digitada; só então chama o RPC e leva ao painel', async () => {
    const wrong = fakeClient({ rpc: {} })
    expect(failed(await requestDeletion(wrong.client, form({ confirmacao: 'excluir' })))).toMatchObject({ intent: 'request-deletion', errors: { confirmacao: expect.stringContaining('EXCLUIR MINHA CONTA') } })
    expect(wrong.rpc).not.toHaveBeenCalled()
    const good = fakeClient({ rpc: { request_account_deletion: ok() } })
    expect(await requestDeletion(good.client, form(confirm))).toEqual({ redirectTo: '/painel' })
    expect(good.rpc).toHaveBeenCalledWith('request_account_deletion')
  })

  it('proprietário de coletivo recebe a orientação do banco (55000); outros erros são genéricos', async () => {
    const owner = failed(await requestDeletion(fakeClient({ rpc: { request_account_deletion: failure('55000', 'Transfira a propriedade ou solicite encerramento ao suporte') } }).client, form(confirm)))
    expect(owner).toMatchObject({ status: 409, message: 'Transfira a propriedade ou solicite encerramento ao suporte' })
    expect(failed(await requestDeletion(fakeClient({ rpc: { request_account_deletion: failure('XX000', 'detalhe') } }).client, form(confirm)))).toMatchObject({ status: 503 })
  })
})

// ---- Pontos de entrada (origem, corpo, sessão), com o cliente real e fetch simulado ----

const origin = 'https://circuitone-dev.magalz.space'
const token = (id: string) =>
  ['eyJhbGciOiJIUzI1NiJ9', Buffer.from(JSON.stringify({ sub: id, exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'), id].join('.')

let calls: { method: string; path: string; body: string }[]
let session: { id: string; name: string; state: string; reason: null } | null
let rpcAnswers: Record<string, unknown>
let probeStatus: number

beforeEach(() => {
  calls = []
  session = { id: 'A', name: 'Pessoa A sintética', state: 'active', reason: null }
  rpcAnswers = {}
  probeStatus = 200
  vi.stubEnv('CIRCUITONE_RUNTIME', 'development')
  vi.stubEnv('APP_ORIGIN', origin)
  vi.stubEnv('SUPABASE_URL', 'https://odphoxozclrshqjgwbqk.supabase.co')
  vi.stubEnv('SUPABASE_PUBLISHABLE_KEY', 'sb_publishable_synthetic')
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string | Request | URL, options?: RequestInit) => {
      const u = new URL(String(url))
      const method = options?.method ?? 'GET'
      calls.push({ method, path: u.pathname, body: String(options?.body ?? '') })
      if (u.pathname === '/auth/v1/token') {
        const body = JSON.parse(String(options?.body))
        if (body.password && body.password !== 'synthetic-password')
          return Response.json({ code: 'invalid_credentials', message: 'Invalid login credentials' }, { status: probeStatus === 200 ? 400 : probeStatus })
        return Response.json({
          access_token: token('A'), refresh_token: 'refresh-A', expires_in: 3600, token_type: 'bearer',
          user: { id: 'A', email: 'a@example.invalid' },
        })
      }
      if (u.pathname === '/auth/v1/user')
        return Response.json({ id: 'A', email: 'a@example.invalid', ...(method === 'PUT' ? JSON.parse(String(options?.body)) : {}) })
      if (u.pathname === '/auth/v1/logout') return new Response(null, { status: 204 })
      if (u.pathname === '/rest/v1/rpc/get_account_session') return Response.json(session)
      const rpcName = /^\/rest\/v1\/rpc\/(.+)$/.exec(u.pathname)?.[1]
      if (rpcName && rpcName in rpcAnswers) return Response.json(rpcAnswers[rpcName])
      throw new Error('HTTP inesperado: ' + method + ' ' + u.pathname)
    }),
  )
})
afterEach(() => vi.unstubAllEnvs())

const signIn = async () => {
  const response = await loginAction(
    new Request(origin + '/entrar', {
      method: 'POST',
      headers: { Origin: origin, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ email: 'a@example.invalid', password: 'synthetic-password' }),
    }),
  )
  calls = []
  return response.headers.getSetCookie().map((value) => value.split(';')[0]).join('; ')
}
const post = (path: string, body: URLSearchParams | string, extra: Record<string, string> = {}) =>
  new Request(origin + path, {
    method: 'POST',
    headers: { Origin: origin, 'Content-Type': 'application/x-www-form-urlencoded', ...extra },
    body,
  })
const rpcCalls = () => calls.filter((call) => call.path.startsWith('/rest/v1/rpc/') && !call.path.endsWith('get_account_session')).map((call) => call.path.split('/').pop())
/** `data()` do React Router: o corpo e o init (status, cabeçalhos) ficam em `data` e `init`. */
const unwrapData = (response: unknown) => {
  const value = response as { data: ActionResult; init: { status: number; headers: Headers } }
  return { body: value.data, status: value.init.status, headers: value.init.headers }
}

describe('ações: origem, corpo e sessão', () => {
  const update = new URLSearchParams({ intent: 'save-account', nome: 'Pessoa Nova', cidade: 'Olinda', estado: 'PE', whatsapp: 'same' })

  it('origem ausente, externa ou cross-site é recusada antes de qualquer acesso ao Auth ou ao banco', async () => {
    const cookie = await signIn()
    for (const headers of [{ Origin: 'https://attacker.invalid' }, { Origin: '' }, { 'Sec-Fetch-Site': 'cross-site' }] as Record<string, string>[]) {
      const request = post('/painel/dados', update, { Cookie: cookie, ...headers })
      const { body, status } = unwrapData(await accountDataAction(request))
      expect(status).toBe(403)
      expect(body).toMatchObject({ ok: false, intent: null })
    }
    expect(calls).toEqual([])
  })

  it('só POST; corpo grande demais (413) e tipo não aceito (415) não chegam ao banco', async () => {
    const cookie = await signIn()
    expect(unwrapData(await accountDataAction(new Request(origin + '/painel/dados', { method: 'GET', headers: { Cookie: cookie } }))).status).toBe(405)
    expect(unwrapData(await accountDataAction(post('/painel/dados', 'x'.repeat(5000), { Cookie: cookie }))).status).toBe(413)
    expect(unwrapData(await accountDataAction(post('/painel/dados', 'a=1', { Cookie: cookie, 'Content-Type': 'application/json' }))).status).toBe(415)
    expect(calls).toEqual([])
  })

  it('visitante é levado para /entrar sem escrever nada', async () => {
    const response = (await accountDataAction(post('/painel/dados.data', update))) as Response
    expect(response.status).toBe(303)
    expect(response.headers.get('location')).toBe('/entrar')
    expect(rpcCalls()).toEqual([])
  })

  it('conta suspensa não escreve: 403 e nenhum RPC de edição', async () => {
    const cookie = await signIn()
    session = { id: 'A', name: 'Pessoa A sintética', state: 'suspended', reason: null }
    const { body, status } = unwrapData(await accountDataAction(post('/painel/dados', update, { Cookie: cookie })))
    expect(status).toBe(403)
    expect(body.ok).toBe(false)
    expect(rpcCalls()).toEqual([])
  })

  it('sucesso: resposta privada, sem cache, e só depois do RPC; sem JavaScript também (rota sem .data)', async () => {
    const cookie = await signIn()
    rpcAnswers = { get_my_account_details: account(), update_my_account_details: null }
    for (const path of ['/painel/dados', '/painel/dados.data']) {
      calls = []
      const { body, status, headers } = unwrapData(await accountDataAction(post(path, update, { Cookie: cookie })))
      expect(status).toBe(200)
      expect(body).toMatchObject({ ok: true, intent: 'save-account', message: 'Dados atualizados.' })
      expect(headers.get('cache-control')).toContain('no-store')
      expect(headers.get('vary')).toContain('Cookie')
      expect(rpcCalls()).toEqual(['get_my_account_details', 'update_my_account_details'])
    }
  })

  it('falha do banco ou do provedor: 503 genérico, sem sucesso falso nem detalhes', async () => {
    const cookie = await signIn()
    rpcAnswers = { get_my_account_details: account() }
    vi.mocked(fetch).mockImplementation(async () => {
      throw new Error('detalhe interno do provedor')
    })
    const { body, status } = unwrapData(await accountDataAction(post('/painel/dados', update, { Cookie: cookie })))
    expect(status).toBe(503)
    expect(body.ok).toBe(false)
    expect(JSON.stringify(body)).not.toContain('detalhe interno')
  })

  it('intenção desconhecida não faz nada', async () => {
    const cookie = await signIn()
    const { body, status } = unwrapData(await accountDataAction(post('/painel/dados', new URLSearchParams({ intent: 'drop-everything' }), { Cookie: cookie })))
    expect(status).toBe(400)
    expect(body.ok).toBe(false)
    expect(rpcCalls()).toEqual([])
  })
})

describe('ações da atuação', () => {
  const valid = new URLSearchParams({ intent: 'save-profile', nome: 'Novo', cidade: 'Recife', estado: 'PE', estilo: 'techno' })

  it('atuação de outra conta: 404 sem escrita (inclusive exclusão)', async () => {
    const cookie = await signIn()
    rpcAnswers = { get_my_profile: null }
    for (const intent of ['save-profile', 'save-professional', 'delete-profile']) {
      calls = []
      await expect(profileAction(post(`/painel/perfil/${ID}`, new URLSearchParams({ ...Object.fromEntries(valid), intent, confirmacao: 'EXCLUIR' }), { Cookie: cookie }), ID)).rejects.toMatchObject({ init: { status: 404 } })
      expect(rpcCalls()).toEqual(['get_my_profile'])
    }
    // Id malformado nem consulta o banco.
    calls = []
    await expect(profileAction(post('/painel/perfil/x', valid, { Cookie: cookie }), 'x')).rejects.toMatchObject({ init: { status: 404 } })
    expect(rpcCalls()).toEqual([])
  })

  it('perfil: salva, descrição longa (acima de 4 KiB) passa e exclusão redireciona com os cookies', async () => {
    const cookie = await signIn()
    rpcAnswers = { get_my_profile: profile(), update_my_profile: null, delete_profile: null }
    const long = new URLSearchParams(valid)
    long.set('descricao', 'á'.repeat(5000))
    const saved = unwrapData(await profileAction(post(`/painel/perfil/${ID}`, long, { Cookie: cookie }), ID))
    expect(saved).toMatchObject({ status: 200, body: { ok: true, intent: 'save-profile' } })
    expect(rpcCalls()).toEqual(['get_my_profile', 'update_my_profile'])
    expect(JSON.parse(calls.find((call) => call.path.endsWith('update_my_profile'))!.body)).toMatchObject({ target: ID, payload: { name: 'Novo', published: false } })
    calls = []
    const removed = (await profileAction(post(`/painel/perfil/${ID}`, new URLSearchParams({ intent: 'delete-profile', confirmacao: 'EXCLUIR' }), { Cookie: cookie }), ID)) as Response
    expect(removed.status).toBe(303)
    expect(removed.headers.get('location')).toBe('/painel/dados')
    expect(removed.headers.get('cache-control')).toContain('no-store')
    expect(rpcCalls()).toEqual(['get_my_profile', 'delete_profile'])
  })
})

describe('ações de segurança de ponta a ponta', () => {
  const pass = (current: string) => new URLSearchParams({ intent: 'change-password', atual: current, nova: 'senha-nova-12', conf: 'senha-nova-12' })

  it('senha atual errada é rejeitada pelo Auth e a senha não é trocada', async () => {
    const cookie = await signIn()
    const { body, status } = unwrapData(await securityAction(post('/painel/seguranca', pass('senha-errada-1'), { Cookie: cookie })))
    expect(status).toBe(400)
    expect(body).toMatchObject({ ok: false, intent: 'change-password', errors: { atual: 'Senha atual incorreta.' } })
    expect(calls.some((call) => call.method === 'PUT')).toBe(false)
  })

  it('senha atual certa: a conferência usa um cliente descartável (sem cookies) e a troca vai ao Auth', async () => {
    const cookie = await signIn()
    const { body, status } = unwrapData(await securityAction(post('/painel/seguranca', pass('synthetic-password'), { Cookie: cookie })))
    expect(status).toBe(200)
    expect(body).toMatchObject({ ok: true, message: 'Senha alterada.' })
    const put = calls.find((call) => call.method === 'PUT')!
    expect(put.path).toBe('/auth/v1/user')
    expect(JSON.parse(put.body)).toMatchObject({ password: 'senha-nova-12' })
    // A sessão criada pela conferência é encerrada em seguida.
    expect(calls.some((call) => call.path === '/auth/v1/logout')).toBe(true)
    expect(JSON.stringify(body)).not.toContain('synthetic-password')
  })

  it('limite de tentativas na conferência vira 429 e nada é trocado', async () => {
    const cookie = await signIn()
    probeStatus = 429
    const { status } = unwrapData(await securityAction(post('/painel/seguranca', pass('qualquer-uma-1'), { Cookie: cookie })))
    expect(status).toBe(429)
    expect(calls.some((call) => call.method === 'PUT')).toBe(false)
  })

  it('exclusão de conta: confirmação digitada, RPC e redirecionamento ao painel', async () => {
    const cookie = await signIn()
    rpcAnswers = { request_account_deletion: null }
    const denied = unwrapData(await securityAction(post('/painel/seguranca', new URLSearchParams({ intent: 'request-deletion', confirmacao: 'sim' }), { Cookie: cookie })))
    expect(denied.status).toBe(400)
    expect(rpcCalls()).toEqual([])
    const response = (await securityAction(post('/painel/seguranca', new URLSearchParams({ intent: 'request-deletion', confirmacao: 'EXCLUIR MINHA CONTA' }), { Cookie: cookie }))) as Response
    expect(response.status).toBe(303)
    expect(response.headers.get('location')).toBe('/painel')
    expect(rpcCalls()).toEqual(['request_account_deletion'])
  })
})
