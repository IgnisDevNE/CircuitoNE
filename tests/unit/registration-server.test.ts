// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { FlowResult } from '../../src/lib/registration-forms'
import {
  completeRegistration,
  confirmEmail,
  confirmLoader,
  confirmationUrl,
  createProfile,
  flowAction,
  loadNewProfile,
  loadRegistration,
  newProfileAction,
  registerAction,
  resendEmail,
  resendPhone,
  sendPhone,
  signUp,
  verifyPhone,
  type Outcome,
} from '../../src/server/registration.server'
import type { SupabaseServerClient } from '../../src/server/supabase.server'

const origin = 'https://circuitone-dev.magalz.space'
const REQUEST_ID = '0b4f2d1c-aaaa-4bbb-8ccc-123456789012'
const USER_ID = '01000000-0000-4000-8000-000000000001'

type Result = { data: unknown; error: unknown; status?: number }
const form = (fields: Record<string, string | string[]>) => {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(fields)) for (const item of Array.isArray(value) ? value : [value]) params.append(key, item)
  return params
}

type FakeUser = {
  id?: string
  email?: string
  phone?: string
  new_phone?: string
  email_confirmed_at?: string | null
  phone_confirmed_at?: string | null
}
const confirmedEmail = '2026-10-07T12:00:00Z'

function fakeClient(
  opts: {
    user?: FakeUser | null
    userError?: unknown
    session?: unknown
    sessionError?: unknown
    rpc?: Record<string, Result>
    tables?: Record<string, Result>
    signUp?: { data?: unknown; error?: unknown }
    resend?: { error: unknown }
    updateUser?: { error: unknown }
    verifyOtp?: { error: unknown }
    exchange?: { error: unknown }
  } = {},
) {
  const user = opts.user === undefined ? null : opts.user
  const auth = {
    getUser: vi.fn(async () => ({ data: { user: user ? { id: USER_ID, ...user } : null }, error: opts.userError ?? null })),
    signUp: vi.fn(async () => ({ data: { user: { identities: [{}] }, session: null, ...(opts.signUp?.data ?? {}) }, error: opts.signUp?.error ?? null })),
    resend: vi.fn(async () => ({ data: {}, error: opts.resend?.error ?? null })),
    updateUser: vi.fn(async () => ({ data: {}, error: opts.updateUser?.error ?? null })),
    verifyOtp: vi.fn(async () => ({ data: {}, error: opts.verifyOtp?.error ?? null })),
    exchangeCodeForSession: vi.fn(async () => ({ data: {}, error: opts.exchange?.error ?? null })),
  }
  const rpc = vi.fn(async (name: string) => {
    if (name === 'get_account_session') return { data: opts.session ?? null, error: opts.sessionError ?? null }
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
  return { client: { auth, rpc, from } as unknown as SupabaseServerClient, auth, rpc, from }
}

const taxonomy = {
  music_styles: { data: [{ name: 'techno' }, { name: 'house' }], error: null },
  music_substyles: { data: [{ style: 'house', name: 'deep house' }], error: null },
}
const incomplete = { id: USER_ID, name: null, state: 'incomplete', reason: null }

const failed = (outcome: Outcome) => {
  if (!('result' in outcome) || outcome.result.ok) throw new Error('esperava falha: ' + JSON.stringify(outcome))
  return { ...outcome.result, status: outcome.status }
}
const succeeded = (outcome: Outcome) => {
  if (!('result' in outcome) || !outcome.result.ok) throw new Error('esperava sucesso: ' + JSON.stringify(outcome))
  return { ...outcome.result, status: outcome.status }
}
const redirected = (outcome: Outcome) => {
  if (!('redirectTo' in outcome)) throw new Error('esperava redirecionamento: ' + JSON.stringify(outcome))
  return outcome.redirectTo
}

beforeEach(() => {
  vi.stubEnv('CIRCUITONE_RUNTIME', 'development')
  vi.stubEnv('APP_ORIGIN', origin)
  vi.stubEnv('SUPABASE_URL', 'https://odphoxozclrshqjgwbqk.supabase.co')
  vi.stubEnv('SUPABASE_PUBLISHABLE_KEY', 'sb_publishable_synthetic')
})
afterEach(() => vi.unstubAllEnvs())

describe('loadRegistration: retoma na etapa certa a partir do estado real', () => {
  const load = (opts: Parameters<typeof fakeClient>[0], path = '/cadastro') => {
    const { client, rpc, from } = fakeClient({ tables: taxonomy, ...opts })
    return { promise: loadRegistration(client, new Request(origin + path), new Headers(), () => REQUEST_ID), rpc, from }
  }

  it('visitante: criar a conta (e o aviso do callback, só os conhecidos)', async () => {
    expect((await load({ user: null }).promise)).toEqual({ kind: 'page', page: { step: 'account', notice: null } })
    expect((await load({ user: null }, '/cadastro?confirmacao=invalida').promise)).toEqual({ kind: 'page', page: { step: 'account', notice: 'invalida' } })
    expect((await load({ user: null }, '/cadastro?confirmacao=indisponivel').promise)).toMatchObject({ page: { notice: 'indisponivel' } })
    expect((await load({ user: null }, '/cadastro?confirmacao=<script>').promise)).toMatchObject({ page: { notice: null } })
  })

  it('e-mail ainda não confirmado: aguardar o link', async () => {
    const { promise } = load({ user: { email: 'a@example.invalid', email_confirmed_at: null }, session: incomplete })
    expect(await promise).toEqual({ kind: 'page', page: { step: 'email', email: 'a@example.invalid', notice: null } })
  })

  it('e-mail confirmado sem celular: pedir o celular; com envio pendente: digitar o código', async () => {
    const base = { email: 'a@example.invalid', email_confirmed_at: confirmedEmail }
    expect(await load({ user: base, session: incomplete }).promise).toEqual({ kind: 'page', page: { step: 'phone', email: 'a@example.invalid' } })
    expect(await load({ user: { ...base, new_phone: '5581999900001' }, session: incomplete }).promise).toEqual({
      kind: 'page',
      page: { step: 'code', email: 'a@example.invalid', phone: '+5581999900001' },
    })
  })

  it('contatos confirmados: dados e atuação, com a taxonomia e o identificador do formulário', async () => {
    const result = await load({
      user: { email: 'a@example.invalid', email_confirmed_at: confirmedEmail, phone: '5581999900001', phone_confirmed_at: confirmedEmail },
      session: incomplete,
    }).promise
    expect(result).toEqual({
      kind: 'page',
      page: {
        step: 'data',
        email: 'a@example.invalid',
        phone: '+5581999900001',
        requestId: REQUEST_ID,
        taxonomia: [
          { estilo: 'house', subestilos: ['deep house'] },
          { estilo: 'techno', subestilos: [] },
        ],
      },
    })
  })

  it('conta ativa, suspensa ou em exclusão não cadastra: vai para o painel; a taxonomia nem é consultada antes da etapa', async () => {
    for (const state of ['active', 'suspended', 'deletion_pending']) {
      const { promise, from } = load({ user: { email: 'a@example.invalid', email_confirmed_at: confirmedEmail, phone_confirmed_at: confirmedEmail }, session: { ...incomplete, state } })
      expect(await promise).toEqual({ kind: 'redirect', to: '/painel' })
      expect(from).not.toHaveBeenCalled()
    }
    const { promise, from } = load({ user: { email_confirmed_at: confirmedEmail }, session: incomplete })
    await promise
    expect(from).not.toHaveBeenCalled()
  })

  it('falha do Auth ou do banco é 503, nunca uma etapa inventada', async () => {
    await expect(load({ user: null, userError: { status: 503, message: 'x' } }).promise).rejects.toMatchObject({ status: 503 })
    await expect(load({ user: { email_confirmed_at: confirmedEmail }, sessionError: { message: 'x' } }).promise).rejects.toMatchObject({ status: 503 })
  })
})

describe('registrationLoader: fora do runtime development', () => {
  it('o preview (protótipo) não chama o Auth: devolve só o marcador', async () => {
    vi.stubEnv('CIRCUITONE_RUNTIME', 'preview')
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('não deveria chamar a rede') }))
    const { registrationLoader } = await import('../../src/server/registration.server')
    const result = (await registrationLoader(new Request(origin + '/cadastro'))) as unknown as { data: unknown }
    expect(result.data).toEqual({ preview: true })
  })
})

describe('confirmEmail: callback do link do e-mail', () => {
  const url = (query: string) => new URL(origin + '/auth/confirmar?' + query)

  it('token_hash + type signup/email: verifyOtp e segue para o cadastro', async () => {
    for (const type of ['signup', 'email']) {
      const { client, auth } = fakeClient()
      expect(await confirmEmail(client, url(`token_hash=abc123&type=${type}`))).toBe('/cadastro')
      expect(auth.verifyOtp).toHaveBeenCalledWith({ type, token_hash: 'abc123' })
      expect(auth.exchangeCodeForSession).not.toHaveBeenCalled()
    }
  })

  it('type email_change (troca de e-mail da conta): volta para a página de segurança', async () => {
    const { client, auth } = fakeClient()
    expect(await confirmEmail(client, url('token_hash=abc&type=email_change'))).toBe('/painel/seguranca')
    expect(auth.verifyOtp).toHaveBeenCalledWith({ type: 'email_change', token_hash: 'abc' })
  })

  it('code (PKCE): exchangeCodeForSession e segue para o cadastro', async () => {
    const { client, auth } = fakeClient()
    expect(await confirmEmail(client, url('code=pkce-code'))).toBe('/cadastro')
    expect(auth.exchangeCodeForSession).toHaveBeenCalledWith('pkce-code')
    expect(auth.verifyOtp).not.toHaveBeenCalled()
  })

  it('link vencido, já usado ou recusado pelo Auth: aviso de link inválido (para pedir outro e-mail)', async () => {
    for (const error of [{ code: 'otp_expired', status: 403, message: 'Email link is invalid or has expired' }, { status: 400, message: 'x' }]) {
      const verify = fakeClient({ verifyOtp: { error } })
      expect(await confirmEmail(verify.client, url('token_hash=abc&type=signup'))).toBe('/cadastro?confirmacao=invalida')
      const exchange = fakeClient({ exchange: { error } })
      expect(await confirmEmail(exchange.client, url('code=x'))).toBe('/cadastro?confirmacao=invalida')
    }
  })

  it('falha do Auth (5xx ou rede) é "indisponível", sem fingir que confirmou', async () => {
    expect(await confirmEmail(fakeClient({ verifyOtp: { error: { status: 503, message: 'x' } } }).client, url('token_hash=a&type=signup'))).toBe('/cadastro?confirmacao=indisponivel')
    expect(await confirmEmail(fakeClient({ exchange: { error: { message: 'fetch failed' } } }).client, url('code=a'))).toBe('/cadastro?confirmacao=indisponivel')
  })

  it('código PKCE de outro navegador (sem o verificador) é link inválido, não indisponibilidade', async () => {
    const { client } = fakeClient({ exchange: { error: { name: 'AuthPKCECodeVerifierMissingError', message: 'PKCE code verifier not found in storage' } } })
    expect(await confirmEmail(client, url('code=x'))).toBe('/cadastro?confirmacao=invalida')
  })

  it('parâmetros ausentes, tipo não aceito, erro do Auth na URL ou token_hash com code: nada é verificado', async () => {
    for (const query of [
      '',
      'type=signup',
      'token_hash=abc',
      'token_hash=abc&type=recovery',
      'token_hash=abc&type=magiclink',
      'error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired',
      'token_hash=abc&type=signup&code=other',
    ]) {
      const { client, auth } = fakeClient()
      const destination = await confirmEmail(client, url(query))
      if (query.endsWith('code=other')) expect(destination).toBe('/cadastro')
      else expect(destination).toBe('/cadastro?confirmacao=invalida')
      if (!query.endsWith('code=other')) {
        expect(auth.verifyOtp).not.toHaveBeenCalled()
        expect(auth.exchangeCodeForSession).not.toHaveBeenCalled()
      }
    }
  })

  it('o loader do recurso sempre redireciona (303) e nunca expõe o token', async () => {
    // Auth fora do ar: o resultado é "indisponível", nunca uma confirmação.
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ message: 'x' }, { status: 503 })))
    const response = await confirmLoader(new Request(origin + '/auth/confirmar?token_hash=abc&type=signup'))
    expect(response.status).toBe(303)
    expect(response.headers.get('location')).toBe('/cadastro?confirmacao=indisponivel')
    expect(response.headers.get('cache-control')).toContain('no-store')
    const missing = await confirmLoader(new Request(origin + '/auth/confirmar'))
    expect(missing.headers.get('location')).toBe('/cadastro?confirmacao=invalida')
  })

  it('o destino do link usa APP_ORIGIN', () => {
    expect(confirmationUrl()).toBe(origin + '/auth/confirmar')
    vi.stubEnv('APP_ORIGIN', '')
    expect(confirmationUrl()).toBeUndefined()
  })
})

describe('signUp e reenvio do e-mail', () => {
  const valid = { email: 'nova@example.invalid', senha: 'senha-segura-1', conf: 'senha-segura-1' }

  it('com confirmação de e-mail: pede o link e não avança sem a sessão', async () => {
    const { client, auth } = fakeClient()
    const result = succeeded(await signUp(client, form(valid)))
    expect(result).toMatchObject({ intent: 'signup', email: 'nova@example.invalid', cooldown: 60, message: expect.stringContaining('nova@example.invalid') })
    expect(auth.signUp).toHaveBeenCalledWith({ email: 'nova@example.invalid', password: 'senha-segura-1', options: { emailRedirectTo: origin + '/auth/confirmar' } })
  })

  it('sem confirmação (sessão devolvida): segue para o cadastro', async () => {
    const { client } = fakeClient({ signUp: { data: { session: { access_token: 'x' } } } })
    expect(redirected(await signUp(client, form(valid)))).toBe('/cadastro')
  })

  it('dados inválidos não chegam ao Auth e nunca devolvem a senha', async () => {
    const { client, auth } = fakeClient()
    const result = failed(await signUp(client, form({ email: 'x', senha: 'curta', conf: 'outra' })))
    expect(result.errors).toMatchObject({ email: expect.any(String), senha: expect.any(String), conf: expect.any(String) })
    expect(JSON.stringify(result)).not.toContain('curta')
    expect(auth.signUp).not.toHaveBeenCalled()
  })

  it('e-mail duplicado, senha fraca, e-mail recusado, cadastro fechado, limite e indisponibilidade têm mensagem própria', async () => {
    const attempt = async (error: unknown) => failed(await signUp(fakeClient({ signUp: { error } }).client, form(valid)))
    expect(await attempt({ code: 'user_already_exists', status: 422 })).toMatchObject({ status: 400, errors: { email: expect.stringContaining('já tem cadastro') }, values: { email: 'nova@example.invalid' } })
    expect(await attempt({ code: 'email_exists', status: 422 })).toMatchObject({ errors: { email: expect.any(String) } })
    expect(await attempt({ code: 'weak_password', status: 422 })).toMatchObject({ errors: { senha: expect.stringContaining('fraca') } })
    expect(await attempt({ code: 'email_address_invalid', status: 400 })).toMatchObject({ errors: { email: expect.any(String) } })
    expect(await attempt({ code: 'signup_disabled', status: 422 })).toMatchObject({ status: 403, message: expect.stringContaining('não estão abertos') })
    expect(await attempt({ code: 'over_email_send_rate_limit', status: 429, message: 'email rate limit exceeded' })).toMatchObject({ status: 429, message: expect.stringContaining('Muitas tentativas') })
    expect(await attempt({ status: 500, message: 'boom' })).toMatchObject({ status: 503, message: 'Serviço temporariamente indisponível. Tente novamente.' })
  })

  it('reenviar o e-mail de confirmação usa auth.resend (signup) com o mesmo destino do link', async () => {
    const { client, auth } = fakeClient()
    const result = succeeded(await resendEmail(client, form({ email: 'nova@example.invalid' })))
    expect(result).toMatchObject({ intent: 'resend-email', email: 'nova@example.invalid', cooldown: 60 })
    expect(result.message).toContain('Se houver um cadastro pendente')
    expect(auth.resend).toHaveBeenCalledWith({ type: 'signup', email: 'nova@example.invalid', options: { emailRedirectTo: origin + '/auth/confirmar' } })
  })

  it('reenvio: e-mail inválido não chega ao Auth; limite mostra o tempo do Auth; falha não é sucesso', async () => {
    const invalid = fakeClient()
    expect(failed(await resendEmail(invalid.client, form({ email: 'x' }))).errors.email).toBeDefined()
    expect(invalid.auth.resend).not.toHaveBeenCalled()
    const limited = failed(await resendEmail(fakeClient({ resend: { error: { status: 429, code: 'over_email_send_rate_limit', message: 'For security purposes, you can only request this after 43 seconds.' } } }).client, form({ email: 'a@example.invalid' })))
    expect(limited).toMatchObject({ status: 429, cooldown: 43, message: 'Aguarde 43 segundos para pedir de novo.' })
    expect(failed(await resendEmail(fakeClient({ resend: { error: { status: 500, message: 'x' } } }).client, form({ email: 'a@example.invalid' }))).status).toBe(503)
  })
})

describe('celular: envio e confirmação do código', () => {
  const ready: FakeUser = { email: 'a@example.invalid', email_confirmed_at: confirmedEmail }

  it('envia o código com updateUser({ phone }) em E.164 e informa o intervalo de reenvio', async () => {
    const { client, auth } = fakeClient({ user: ready })
    const result = succeeded(await sendPhone(client, form({ telefone: '(81) 99999-0001' })))
    expect(auth.updateUser).toHaveBeenCalledWith({ phone: '+5581999990001' })
    expect(result).toMatchObject({ intent: 'send-phone', cooldown: 60, message: 'Enviamos um código por SMS para +55 (81) 99999-0001.' })
  })

  it('exige sessão, e-mail confirmado e celular brasileiro válido; celular já confirmado volta ao cadastro', async () => {
    expect(failed(await sendPhone(fakeClient({ user: null }).client, form({ telefone: '81999990001' }))).status).toBe(401)
    const unconfirmed = fakeClient({ user: { email_confirmed_at: null } })
    expect(failed(await sendPhone(unconfirmed.client, form({ telefone: '81999990001' }))).status).toBe(403)
    const invalid = fakeClient({ user: ready })
    expect(failed(await sendPhone(invalid.client, form({ telefone: '+1 415 555 0100' }))).errors.telefone).toBeDefined()
    expect(invalid.auth.updateUser).not.toHaveBeenCalled()
    expect(redirected(await sendPhone(fakeClient({ user: { ...ready, phone_confirmed_at: confirmedEmail } }).client, form({ telefone: '81999990001' })))).toBe('/cadastro')
  })

  it('celular já usado por outra conta vira erro no campo, sem revelar quem usa', async () => {
    const result = failed(await sendPhone(fakeClient({ user: ready, updateUser: { error: { code: 'phone_exists', status: 422, message: 'Phone number already registered by another user' } } }).client, form({ telefone: '81 99999-0001' })))
    expect(result).toMatchObject({ status: 409, errors: { telefone: 'Este celular já está em uso por outra conta.' }, values: { telefone: '81 99999-0001' } })
  })

  it('limite de SMS do Auth mostra o tempo restante; falha do envio e indisponibilidade não são sucesso', async () => {
    const attempt = async (error: unknown) => failed(await sendPhone(fakeClient({ user: ready, updateUser: { error } }).client, form({ telefone: '81999990001' })))
    expect(await attempt({ code: 'over_sms_send_rate_limit', status: 429, message: 'For security purposes, you can only request this after 52 seconds.' })).toMatchObject({ status: 429, cooldown: 52, message: 'Aguarde 52 segundos para pedir de novo.' })
    expect(await attempt({ code: 'over_request_rate_limit', status: 429, message: 'Request rate limit reached' })).toMatchObject({ status: 429, message: expect.stringContaining('Muitas tentativas') })
    expect(await attempt({ code: 'sms_send_failed', status: 500, message: 'Error sending sms' })).toMatchObject({ status: 503, message: expect.stringContaining('SMS') })
    expect(await attempt({ code: 'validation_failed', status: 422, message: 'Invalid phone' })).toMatchObject({ errors: { telefone: expect.any(String) } })
    expect(await attempt({ status: 503, message: 'x' })).toMatchObject({ status: 503 })
  })

  it('reenvia o código para o número pendente (phone_change), nunca para um número vindo do formulário', async () => {
    const { client, auth } = fakeClient({ user: { ...ready, new_phone: '5581999990001' } })
    expect(succeeded(await resendPhone(client))).toMatchObject({ intent: 'resend-phone', cooldown: 60 })
    expect(auth.resend).toHaveBeenCalledWith({ type: 'phone_change', phone: '+5581999990001' })
    expect(failed(await resendPhone(fakeClient({ user: ready }).client)).errors.telefone).toBeDefined()
    expect(failed(await resendPhone(fakeClient({ user: null }).client)).status).toBe(401)
    const limited = failed(await resendPhone(fakeClient({ user: { ...ready, new_phone: '5581999990001' }, resend: { error: { code: 'over_sms_send_rate_limit', status: 429, message: 'you can only request this after 12 seconds' } } }).client))
    expect(limited).toMatchObject({ status: 429, cooldown: 12 })
  })

  it('confirma o código com verifyOtp(phone_change) e retoma o cadastro', async () => {
    const { client, auth } = fakeClient({ user: { ...ready, new_phone: '5581999990001' } })
    expect(redirected(await verifyPhone(client, form({ codigo: '123 456' })))).toBe('/cadastro')
    expect(auth.verifyOtp).toHaveBeenCalledWith({ phone: '+5581999990001', token: '123456', type: 'phone_change' })
  })

  it('código errado ou vencido é erro no campo; formato inválido não chega ao Auth', async () => {
    const wrong = failed(await verifyPhone(fakeClient({ user: { ...ready, new_phone: '5581999990001' }, verifyOtp: { error: { code: 'otp_expired', status: 403, message: 'Token has expired or is invalid' } } }).client, form({ codigo: '000000' })))
    expect(wrong.errors.codigo).toContain('inválido ou expirado')
    const short = fakeClient({ user: { ...ready, new_phone: '5581999990001' } })
    expect(failed(await verifyPhone(short.client, form({ codigo: '12' }))).errors.codigo).toBeDefined()
    expect(short.auth.verifyOtp).not.toHaveBeenCalled()
  })

  it('verificação: sem sessão, sem envio pendente, limite, celular tomado e indisponibilidade', async () => {
    const pending = { ...ready, new_phone: '5581999990001' }
    expect(failed(await verifyPhone(fakeClient({ user: null }).client, form({ codigo: '123456' }))).status).toBe(401)
    expect(failed(await verifyPhone(fakeClient({ user: ready }).client, form({ codigo: '123456' }))).status).toBe(409)
    const attempt = async (error: unknown) => failed(await verifyPhone(fakeClient({ user: pending, verifyOtp: { error } }).client, form({ codigo: '123456' })))
    expect(await attempt({ status: 429, code: 'over_request_rate_limit', message: 'x' })).toMatchObject({ status: 429 })
    expect(await attempt({ status: 422, code: 'phone_exists', message: 'x' })).toMatchObject({ status: 409, message: expect.stringContaining('já está em uso') })
    expect(await attempt({ status: 503, message: 'x' })).toMatchObject({ status: 503 })
  })
})

describe('completeRegistration: dados e primeira atuação', () => {
  const user: FakeUser = { email: 'a@example.invalid', phone: '5581999990001', email_confirmed_at: confirmedEmail, phone_confirmed_at: confirmedEmail }
  const valid = {
    nome: 'Pessoa Teste', cpf: '529.982.247-25', nascimento: '1990-05-20', genero: '', cidade: 'Recife', estado: 'PE',
    whatsapp: 'same', tipo: 'artista', atuacaoNome: 'DJ Teste', estilo: ['techno'], requestId: REQUEST_ID,
  }

  it('chama complete_registration com a conta, a atuação e o identificador do formulário, e vai para o painel', async () => {
    const { client, rpc } = fakeClient({ user, rpc: { complete_registration: { data: 'perfil-1', error: null } } })
    expect(redirected(await completeRegistration(client, form(valid)))).toBe('/painel')
    expect(rpc).toHaveBeenCalledWith('complete_registration', {
      account: { name: 'Pessoa Teste', cpf: '52998224725', birth_date: '1990-05-20', gender: null, city: 'Recife', state_code: 'PE', phone_is_whatsapp: true, whatsapp_number: null },
      profile: { kind: 'artist', name: 'DJ Teste', styles: [{ style: 'techno', substyle: null }] },
      request_id: REQUEST_ID,
    })
  })

  it('validação no servidor: menor de idade e CPF inválido não chegam ao banco', async () => {
    const { client, rpc } = fakeClient({ user })
    const result = failed(await completeRegistration(client, form({ ...valid, nascimento: '2015-01-01', cpf: '123' })))
    expect(result.errors).toMatchObject({ nascimento: expect.stringContaining('18 anos'), cpf: expect.any(String) })
    expect(rpc).not.toHaveBeenCalled()
  })

  it('sem sessão: sessão expirada', async () => {
    expect(failed(await completeRegistration(fakeClient({ user: null }).client, form(valid))).status).toBe(401)
  })

  const rpcError = (error: unknown, status?: number) => ({ rpc: { complete_registration: { data: null, error, status } } })

  it('CPF ou dado recusado pelo banco (22023): mensagem no CPF, sem dizer se o CPF é de outra conta', async () => {
    const result = failed(await completeRegistration(fakeClient({ user, ...rpcError({ code: '22023', message: 'Não foi possível concluir o cadastro com estes dados' }) }).client, form(valid)))
    expect(result).toMatchObject({ status: 422, errors: { cpf: expect.stringContaining('suporte') }, values: { cpf: '529.982.247-25', tipo: 'artista', estilo: ['techno'] } })
    expect(JSON.stringify(result)).not.toContain(REQUEST_ID)
  })

  it('cadastro já concluído com outra solicitação (outra aba): segue para o painel', async () => {
    const outcome = await completeRegistration(fakeClient({ user, ...rpcError({ code: '22023', message: 'Cadastro já concluído com outra solicitação' }) }).client, form(valid))
    expect(redirected(outcome)).toBe('/painel')
  })

  it('identidade não confirmada (42501), sessão expirada (401) e indisponibilidade', async () => {
    const attempt = async (error: unknown, status?: number) => failed(await completeRegistration(fakeClient({ user, ...rpcError(error, status) }).client, form(valid)))
    expect(await attempt({ code: '42501', message: 'Identidade confirmada necessária' })).toMatchObject({ status: 403, message: expect.stringContaining('Confirme seu e-mail e seu celular') })
    expect(await attempt({ code: '42501', message: 'Conta indisponível' })).toMatchObject({ status: 403, message: 'Esta conta não pode concluir o cadastro.' })
    expect(await attempt({ code: '42501', message: 'x' }, 401)).toMatchObject({ status: 401 })
    expect(await attempt({ code: '57014', message: 'texto interno do banco' })).toMatchObject({ status: 503 })
    expect(JSON.stringify(await attempt({ code: '57014', message: 'texto interno do banco' }))).not.toContain('texto interno')
  })
})

describe('nova atuação', () => {
  it('lista a taxonomia pública', async () => {
    expect(await loadNewProfile(fakeClient({ tables: taxonomy }).client)).toEqual({
      taxonomia: [{ estilo: 'house', subestilos: ['deep house'] }, { estilo: 'techno', subestilos: [] }],
    })
    await expect(loadNewProfile(fakeClient({ tables: { ...taxonomy, music_styles: { data: null, error: { message: 'x' } } } }).client)).rejects.toMatchObject({ status: 503 })
  })

  it('cria a atuação com create_profile e abre a edição dela', async () => {
    const { client, rpc } = fakeClient({ rpc: { create_profile: { data: 'perfil-9', error: null } } })
    const outcome = await createProfile(client, form({ tipo: 'artista', atuacaoNome: 'Projeto Novo', estilo: ['techno', 'house|deep house'] }))
    expect(redirected(outcome)).toBe('/painel/perfil/perfil-9')
    expect(rpc).toHaveBeenCalledWith('create_profile', {
      payload: { kind: 'artist', name: 'Projeto Novo', styles: [{ style: 'techno', substyle: null }, { style: 'house', substyle: 'deep house' }] },
    })
  })

  it('integrante sem nome usa o nome da conta', async () => {
    const { client, rpc } = fakeClient({ rpc: { get_my_account_details: { data: { name: 'Pessoa Teste' }, error: null }, create_profile: { data: 'perfil-2', error: null } } })
    await createProfile(client, form({ tipo: 'integrante', atuacaoNome: '' }))
    expect(rpc).toHaveBeenCalledWith('create_profile', { payload: { kind: 'member', name: 'Pessoa Teste' } })
  })

  it('validação no servidor e erros do banco (sem texto interno)', async () => {
    const invalid = fakeClient()
    expect(failed(await createProfile(invalid.client, form({ tipo: 'artista', atuacaoNome: 'x' }))).errors.estilo).toBeDefined()
    expect(invalid.rpc).not.toHaveBeenCalled()
    const attempt = async (error: unknown, status?: number) =>
      failed(await createProfile(fakeClient({ rpc: { create_profile: { data: null, error, status } } }).client, form({ tipo: 'servicos', atuacaoNome: 'Som' })))
    expect(await attempt({ code: '42501', message: 'Conta indisponível' })).toMatchObject({ status: 403 })
    expect(await attempt({ code: '22023', message: 'Dados de atuação inválidos' })).toMatchObject({ status: 422, values: { tipo: 'servicos' } })
    expect(await attempt({ code: '42501', message: 'x' }, 401)).toMatchObject({ status: 401 })
    expect(await attempt({ code: 'XX000', message: 'interno' })).toMatchObject({ status: 503 })
  })
})

describe('flowAction: origem, corpo e intenção', () => {
  const post = (path: string, body: URLSearchParams | string, extra: Record<string, string> = {}) =>
    new Request(origin + path, { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/x-www-form-urlencoded', ...extra }, body })
  const unwrap = (response: unknown) => {
    const value = response as { data: FlowResult; init: { status: number; headers: Headers } }
    return { body: value.data, status: value.init.status, headers: value.init.headers }
  }

  it('origem ausente, externa ou cross-site é recusada antes de qualquer acesso', async () => {
    const handle = vi.fn()
    for (const headers of [{ Origin: 'https://attacker.invalid' }, { Origin: '' }, { 'Sec-Fetch-Site': 'cross-site' }] as Record<string, string>[]) {
      const { body, status } = unwrap(await flowAction(post('/cadastro', form({ intent: 'signup' }), headers), '/cadastro', handle))
      expect(status).toBe(403)
      expect(body).toMatchObject({ ok: false, intent: null })
    }
    expect(handle).not.toHaveBeenCalled()
  })

  it('só POST no caminho esperado; aceita o sufixo .data do single fetch; 413 e 415 não chegam ao handler', async () => {
    const handle = vi.fn(async (): Promise<Outcome> => ({ redirectTo: '/cadastro' }))
    expect(unwrap(await flowAction(new Request(origin + '/cadastro'), '/cadastro', handle)).status).toBe(405)
    expect(unwrap(await flowAction(post('/outro', form({})), '/cadastro', handle)).status).toBe(405)
    expect(unwrap(await flowAction(post('/cadastro', 'x'.repeat(20000)), '/cadastro', handle)).status).toBe(413)
    expect(unwrap(await flowAction(post('/cadastro', 'a=1', { 'Content-Type': 'application/json' }), '/cadastro', handle)).status).toBe(415)
    expect(handle).not.toHaveBeenCalled()
    const response = (await flowAction(post('/cadastro.data', form({ intent: 'x' })), '/cadastro', handle)) as Response
    expect(response.status).toBe(303)
    expect(response.headers.get('location')).toBe('/cadastro')
    expect(response.headers.get('cache-control')).toContain('no-store')
  })

  it('erro inesperado do handler é indisponibilidade, sem texto interno', async () => {
    const { body, status } = unwrap(await flowAction(post('/cadastro', form({})), '/cadastro', async () => { throw new Error('segredo interno') }))
    expect(status).toBe(503)
    expect(JSON.stringify(body)).not.toContain('segredo')
  })

  it('intenção desconhecida é recusada (400) e a respostas são privadas', async () => {
    const { body, status, headers } = unwrap(await registerAction(post('/cadastro', form({ intent: 'apagar-tudo' }))))
    expect(status).toBe(400)
    expect(body).toMatchObject({ ok: false, intent: null, message: 'Operação indisponível.' })
    expect(headers.get('cache-control')).toContain('no-store')
    expect(unwrap(await newProfileAction(post('/painel/dados/nova-atuacao', form({ tipo: 'x' })))).status).toBe(400)
  })
})
