import type { User } from '@supabase/supabase-js'
import { data, redirect } from 'react-router'
import {
  formatBrazilianPhone,
  parseCodeForm,
  parseNewProfileForm,
  parsePhoneForm,
  parseRegistrationForm,
  parseResendEmailForm,
  parseSignupForm,
  profileValues,
  registrationValues,
  registrationStep,
  type FieldErrors,
  type FlowIntent,
  type FlowResult,
  type FormValues,
  type RegistrationNotice,
  type RegistrationPage,
  type RegistrationStep,
} from '../lib/registration-forms'
import type { Json } from '../types/database.generated'
import { boundedForm, readAccountSession, routePath } from './auth.server'
import { mapTaxonomy, type Taxonomia } from './mappers/account-settings'
import {
  createSupabaseServerClient,
  HttpError,
  privateHeaders,
  unavailable,
  unwrap,
  type SupabaseServerClient,
} from './supabase.server'

const UNAVAILABLE = 'Serviço temporariamente indisponível. Tente novamente.'
const SESSION_EXPIRED = 'Sua sessão expirou. Entre novamente para continuar.'
/** Intervalo mínimo entre envios que a interface respeita (o Auth impõe o seu e informa o tempo restante). */
export const RESEND_COOLDOWN_SECONDS = 60

/** `APP_ORIGIN` + `/auth/confirmar`: destino dos links de confirmação (precisa estar na lista de Redirect URLs do Auth). */
export const confirmationUrl = () => (process.env.APP_ORIGIN ? `${process.env.APP_ORIGIN}/auth/confirmar` : undefined)

// ---- Loader de /cadastro ----

/** `+` e dígitos: o Auth guarda o celular sem o "+". */
export const toE164 = (value: string) => `+${value.replace(/\D/g, '')}`

export type RegistrationLoad = { kind: 'redirect'; to: string } | { kind: 'page'; page: Exclude<RegistrationPage, { preview: true }> }

/**
 * Etapa real do cadastro, a partir da identidade validada no servidor (getUser + `get_account_session`): sem sessão,
 * a conta; e-mail pendente; celular (ou o código, se há envio pendente); dados. Conta ativa, suspensa ou em exclusão
 * não cadastra: vai para o painel.
 */
export async function loadRegistration(
  client: SupabaseServerClient,
  request: Request,
  headers: Headers,
  newRequestId: () => string = () => crypto.randomUUID(),
): Promise<RegistrationLoad> {
  const param = new URL(request.url).searchParams.get('confirmacao')
  const notice: RegistrationNotice | null = param === 'invalida' || param === 'indisponivel' ? param : null
  const session = await readAccountSession(client, request, headers)
  if (session.kind === 'error') throw new HttpError(503, session.message)
  if (session.kind === 'anonymous') return { kind: 'page', page: { step: 'account', notice } }
  if (session.account.state !== 'incomplete') return { kind: 'redirect', to: '/painel' }
  const { user } = session
  const email = user.email ?? ''
  const step: RegistrationStep = registrationStep(user)
  if (step === 'account' || step === 'email') return { kind: 'page', page: { step: 'email', email, notice } }
  if (step === 'phone') return { kind: 'page', page: { step, email } }
  if (step === 'code') return { kind: 'page', page: { step, email, phone: toE164(user.new_phone ?? '') } }
  const [styles, substyles] = await Promise.all([
    client.from('music_styles').select('name'),
    client.from('music_substyles').select('style,name'),
  ])
  return {
    kind: 'page',
    page: { step, email, phone: toE164(user.phone ?? ''), requestId: newRequestId(), taxonomia: mapTaxonomy(unwrap(styles), unwrap(substyles)) },
  }
}

export async function registrationLoader(request: Request) {
  if (process.env.CIRCUITONE_RUNTIME !== 'development') return data({ preview: true } satisfies RegistrationPage)
  const headers = privateHeaders()
  let result: RegistrationLoad
  try {
    result = await loadRegistration(createSupabaseServerClient(request, headers), request, headers)
  } catch (error) {
    const failure = error instanceof HttpError ? error : unavailable()
    throw data({ message: failure.message }, { status: failure.status, headers })
  }
  if (result.kind === 'redirect') throw redirect(result.to, { headers })
  return data(result.page, { headers })
}

// ---- Confirmação de e-mail (/auth/confirmar) ----

/** Tipos de link que o callback aceita (`signup`/`email` confirmam o cadastro; `email_change` é a troca de e-mail). */
const CONFIRM_TYPES = ['signup', 'email', 'email_change'] as const
type ConfirmType = (typeof CONFIRM_TYPES)[number]
const isConfirmType = (value: string | null): value is ConfirmType => CONFIRM_TYPES.includes(value as ConfirmType)

type AuthFailure = { code?: string; status?: number; message?: string }
/** Falhas que são do link (vencido, usado, de outro navegador); o resto (rede, 5xx) é indisponibilidade. */
const PKCE_LINK_ERRORS = ['AuthPKCECodeVerifierMissingError', 'AuthPKCEGrantCodeExchangeError']
const serverSide = (error: AuthFailure & { name?: string }) =>
  !PKCE_LINK_ERRORS.includes(error.name ?? '') && (error.status === undefined || error.status >= 500)

/**
 * Destino depois de abrir o link do e-mail: `token_hash` + `type` (`verifyOtp`) ou `code` (PKCE, `exchangeCodeForSession`).
 * Link vencido, usado ou malformado volta para `/cadastro?confirmacao=invalida`, onde dá para pedir outro e-mail;
 * falha do Auth, `indisponivel`. Nunca confirma nada sem o Auth responder sem erro.
 */
export async function confirmEmail(client: SupabaseServerClient, url: URL): Promise<string> {
  const tokenHash = url.searchParams.get('token_hash')
  const type = url.searchParams.get('type')
  const code = url.searchParams.get('code')
  let error: AuthFailure | null
  if (tokenHash && isConfirmType(type)) ({ error } = await client.auth.verifyOtp({ type, token_hash: tokenHash }))
  else if (code && !tokenHash) ({ error } = await client.auth.exchangeCodeForSession(code))
  else return '/cadastro?confirmacao=invalida'
  if (error) return serverSide(error) ? '/cadastro?confirmacao=indisponivel' : '/cadastro?confirmacao=invalida'
  return type === 'email_change' ? '/painel/seguranca' : '/cadastro'
}

/** Loader do recurso `/auth/confirmar`: sempre redireciona, com os cookies da sessão criada pela confirmação. */
export async function confirmLoader(request: Request) {
  const headers = privateHeaders()
  let location: string
  try {
    location = await confirmEmail(createSupabaseServerClient(request, headers), new URL(request.url))
  } catch {
    location = '/cadastro?confirmacao=indisponivel'
  }
  return redirect(location, { headers, status: 303 })
}

// ---- Ações ----

export type Outcome = { result: FlowResult; status: number } | { redirectTo: string }

const ok = (intent: FlowIntent, message: string, extra: { email?: string; cooldown?: number } = {}): Outcome => ({
  result: { ok: true, intent, message, ...extra },
  status: 200,
})

const fail = (
  intent: FlowIntent | null,
  errors: FieldErrors,
  options: { values?: FormValues; message?: string; status?: number; cooldown?: number } = {},
): Outcome => ({
  result: { ok: false, intent, message: options.message ?? null, errors, values: options.values, cooldown: options.cooldown },
  status: options.status ?? 400,
})

/**
 * Casca das ações do cadastro e da nova atuação: só POST no caminho esperado (sem o `.data` do single fetch), origem
 * confiável vinda da configuração, corpo limitado, cliente com os cookies do titular e resposta privada com os cookies
 * renovados. Diferente das ações da conta, serve também a quem ainda não tem conta ativa.
 */
export async function flowAction(
  request: Request,
  path: string,
  handle: (context: { client: SupabaseServerClient; form: URLSearchParams }) => Promise<Outcome>,
  options: { limit?: number } = {},
) {
  const headers = privateHeaders()
  const reply = (result: FlowResult, status: number) => data(result, { status, headers })
  const deny = (status: number, message: string) => reply({ ok: false, intent: null, message, errors: {} }, status)
  if (request.method !== 'POST' || routePath(request) !== path) return deny(405, 'Operação indisponível.')
  // A origem externa vem da configuração; não confiar em cabeçalhos forwarded do cliente.
  if (
    !process.env.APP_ORIGIN ||
    request.headers.get('origin') !== process.env.APP_ORIGIN ||
    request.headers.get('sec-fetch-site') === 'cross-site'
  )
    return deny(403, 'Origem recusada.')
  let outcome: Outcome
  try {
    const form = await boundedForm(request, options.limit ?? 16 * 1024)
    outcome = await handle({ client: createSupabaseServerClient(request, headers), form })
  } catch (error) {
    if (error instanceof Response) return deny(error.status === 413 ? 413 : 415, error.status === 413 ? 'Dados grandes demais.' : 'Formato de envio não aceito.')
    return deny(503, UNAVAILABLE)
  }
  if ('redirectTo' in outcome) return redirect(outcome.redirectTo, { headers, status: 303 })
  return reply(outcome.result, outcome.status)
}

const intentOf = (form: URLSearchParams) => form.get('intent') ?? ''
const unknownIntent = () => fail(null, {}, { message: 'Operação indisponível.', status: 400 })

const isRateLimited = (error: AuthFailure) =>
  error.status === 429 || ['over_request_rate_limit', 'over_email_send_rate_limit', 'over_sms_send_rate_limit'].includes(error.code ?? '')

/** Limite de envio do Auth ("you can only request this after N seconds"): mostra o tempo que ele informa. */
function rateLimited(intent: FlowIntent, error: AuthFailure): Outcome {
  const seconds = Number(/(\d{1,4})\s+seconds?/i.exec(error.message ?? '')?.[1])
  return Number.isFinite(seconds) && seconds > 0
    ? fail(intent, {}, { message: `Aguarde ${seconds} segundos para pedir de novo.`, status: 429, cooldown: seconds })
    : fail(intent, {}, { message: 'Muitas tentativas. Aguarde alguns minutos e tente de novo.', status: 429 })
}

const SMS_FAILED = 'Não foi possível enviar o SMS agora. Tente novamente em instantes.'

/** Identidade validada no servidor; `null` quando não há sessão (sessão expirada) e falha de rede ou 5xx é indisponibilidade. */
async function currentUser(client: SupabaseServerClient): Promise<User | null> {
  const { data: result, error } = await client.auth.getUser()
  if (error && !(error.status && error.status < 500)) throw unavailable()
  return result.user
}

const expired = (intent: FlowIntent) => fail(intent, {}, { message: SESSION_EXPIRED, status: 401 })

// -- Etapa 1: conta --

export async function signUp(client: SupabaseServerClient, form: URLSearchParams): Promise<Outcome> {
  const parsed = parseSignupForm(form)
  if (!parsed.ok) return fail('signup', parsed.errors, { values: parsed.values })
  const { email, password } = parsed.payload
  const { data: result, error } = await client.auth.signUp({ email, password, options: { emailRedirectTo: confirmationUrl() } })
  if (error) {
    if (error.code === 'user_already_exists' || error.code === 'email_exists')
      return fail('signup', { email: 'Este e-mail já tem cadastro. Entre com ele ou use outro.' }, { values: { email } })
    if (error.code === 'weak_password')
      return fail('signup', { senha: 'Senha fraca demais: use mais caracteres e evite sequências ou senhas comuns.' }, { values: { email } })
    if (error.code === 'email_address_invalid') return fail('signup', { email: 'Este e-mail não pode ser usado. Confira o endereço.' }, { values: { email } })
    if (error.code === 'signup_disabled') return fail('signup', {}, { message: 'Os cadastros não estão abertos neste momento.', status: 403, values: { email } })
    if (isRateLimited(error)) return rateLimited('signup', error)
    return fail('signup', {}, { message: UNAVAILABLE, status: 503, values: { email } })
  }
  // Sem confirmação de e-mail no projeto, o Auth já devolve a sessão: segue direto para a próxima etapa.
  if (result.session) return { redirectTo: '/cadastro' }
  // Com confirmação, e-mail já cadastrado responde igual (sem confirmar nem negar que o endereço existe).
  return ok('signup', `Enviamos um link de confirmação para ${email}.`, { email, cooldown: RESEND_COOLDOWN_SECONDS })
}

export async function resendEmail(client: SupabaseServerClient, form: URLSearchParams): Promise<Outcome> {
  const parsed = parseResendEmailForm(form)
  if (!parsed.ok) return fail('resend-email', parsed.errors, { values: parsed.values })
  const { email } = parsed.payload
  const { error } = await client.auth.resend({ type: 'signup', email, options: { emailRedirectTo: confirmationUrl() } })
  if (error) {
    if (error.code === 'email_address_invalid') return fail('resend-email', { email: 'Este e-mail não pode ser usado. Confira o endereço.' }, { values: { email } })
    if (isRateLimited(error)) return rateLimited('resend-email', error)
    return fail('resend-email', {}, { message: UNAVAILABLE, status: 503, values: { email } })
  }
  return ok('resend-email', `Se houver um cadastro pendente para ${email}, enviamos um novo link de confirmação.`, {
    email,
    cooldown: RESEND_COOLDOWN_SECONDS,
  })
}

// -- Etapa 2: celular --

/** Erros do Auth ao pedir o código por SMS (`updateUser({ phone })` ou `resend`). */
function smsFailure(intent: FlowIntent, error: AuthFailure, values?: FormValues): Outcome {
  if (error.code === 'phone_exists') return fail(intent, { telefone: 'Este celular já está em uso por outra conta.' }, { values, status: 409 })
  if (error.code === 'validation_failed')
    return fail(intent, { telefone: 'Informe um celular brasileiro com DDD, ex.: 81 99999-0001.' }, { values })
  if (isRateLimited(error)) return rateLimited(intent, error)
  // 503, nunca 502/504: o Cloudflare troca essas respostas da origem pela página dele e o formulário perde a mensagem.
  if (error.code === 'sms_send_failed' || error.status === 500 || error.status === 502) return fail(intent, {}, { message: SMS_FAILED, status: 503, values })
  return fail(intent, {}, { message: UNAVAILABLE, status: 503, values })
}

export async function sendPhone(client: SupabaseServerClient, form: URLSearchParams): Promise<Outcome> {
  const user = await currentUser(client)
  if (!user) return expired('send-phone')
  if (!user.email_confirmed_at) return fail('send-phone', {}, { message: 'Confirme seu e-mail antes de informar o celular.', status: 403 })
  if (user.phone_confirmed_at) return { redirectTo: '/cadastro' }
  const parsed = parsePhoneForm(form)
  if (!parsed.ok) return fail('send-phone', parsed.errors, { values: parsed.values })
  const { phone } = parsed.payload
  const { error } = await client.auth.updateUser({ phone })
  if (error) return smsFailure('send-phone', error, { telefone: form.get('telefone')?.trim() ?? '' })
  return ok('send-phone', `Enviamos um código por SMS para ${formatBrazilianPhone(phone)}.`, { cooldown: RESEND_COOLDOWN_SECONDS })
}

export async function resendPhone(client: SupabaseServerClient): Promise<Outcome> {
  const user = await currentUser(client)
  if (!user) return expired('resend-phone')
  if (!user.new_phone) return fail('resend-phone', { telefone: 'Informe o celular para receber o código.' })
  const phone = toE164(user.new_phone)
  const { error } = await client.auth.resend({ type: 'phone_change', phone })
  if (error) return smsFailure('resend-phone', error)
  return ok('resend-phone', `Enviamos um novo código por SMS para ${formatBrazilianPhone(phone)}.`, { cooldown: RESEND_COOLDOWN_SECONDS })
}

export async function verifyPhone(client: SupabaseServerClient, form: URLSearchParams): Promise<Outcome> {
  const user = await currentUser(client)
  if (!user) return expired('verify-phone')
  if (!user.new_phone) return fail('verify-phone', {}, { message: 'Informe o celular para receber o código.', status: 409 })
  const parsed = parseCodeForm(form)
  if (!parsed.ok) return fail('verify-phone', parsed.errors, { values: parsed.values })
  const { error } = await client.auth.verifyOtp({ phone: toE164(user.new_phone), token: parsed.payload.code, type: 'phone_change' })
  if (error) {
    if (error.code === 'phone_exists') return fail('verify-phone', {}, { message: 'Este celular já está em uso por outra conta. Informe outro número.', status: 409 })
    if (isRateLimited(error)) return rateLimited('verify-phone', error)
    if (error.status !== undefined && error.status < 500)
      return fail('verify-phone', { codigo: 'Código inválido ou expirado. Confira o código ou peça um novo.' })
    return fail('verify-phone', {}, { message: UNAVAILABLE, status: 503 })
  }
  return { redirectTo: '/cadastro' }
}

// -- Etapa 3: dados e primeira atuação --

type RpcError = { code?: string; message?: string }

function registrationRpcFailure(error: RpcError, status: number | undefined, values: FormValues): Outcome {
  if (status === 401) return expired('complete')
  if (error.code === '42501')
    return fail(
      'complete',
      {},
      {
        message:
          error.message === 'Identidade confirmada necessária'
            ? 'Confirme seu e-mail e seu celular antes de concluir o cadastro.'
            : 'Esta conta não pode concluir o cadastro.',
        status: 403,
        values,
      },
    )
  if (error.code === '22023') {
    // Cadastro já feito em outra aba/solicitação: nada a refazer.
    if (error.message === 'Cadastro já concluído com outra solicitação') return { redirectTo: '/painel' }
    // O banco não diz qual dado recusou (nem confirma se um CPF já tem dono): a mensagem fica no CPF, o caso mais provável.
    return fail(
      'complete',
      { cpf: 'Não foi possível concluir o cadastro com este CPF. Confira os dados; se o CPF já tiver cadastro, entre na sua conta ou fale com o suporte.' },
      { message: 'Não foi possível concluir o cadastro com estes dados.', status: 422, values },
    )
  }
  return fail('complete', {}, { message: UNAVAILABLE, status: 503, values })
}

export async function completeRegistration(client: SupabaseServerClient, form: URLSearchParams): Promise<Outcome> {
  const user = await currentUser(client)
  if (!user) return expired('complete')
  const parsed = parseRegistrationForm(form, user.phone ? toE164(user.phone) : '')
  if (!parsed.ok) return fail('complete', parsed.errors, { values: parsed.values })
  const { account, profile, requestId } = parsed.payload
  const { error, status } = await client.rpc('complete_registration', {
    account: account as unknown as Json,
    profile: profile as unknown as Json,
    request_id: requestId,
  })
  if (error) return registrationRpcFailure(error, status, registrationValues(form))
  return { redirectTo: '/painel' }
}

export const registerAction = (request: Request) =>
  flowAction(request, '/cadastro', async ({ client, form }) => {
    switch (intentOf(form)) {
      case 'signup':
        return signUp(client, form)
      case 'resend-email':
        return resendEmail(client, form)
      case 'send-phone':
        return sendPhone(client, form)
      case 'resend-phone':
        return resendPhone(client)
      case 'verify-phone':
        return verifyPhone(client, form)
      case 'complete':
        return completeRegistration(client, form)
      default:
        return unknownIntent()
    }
  })

// -- Nova atuação (/painel/dados/nova-atuacao) --

export type NewProfilePage = { taxonomia: Taxonomia }

export async function loadNewProfile(client: SupabaseServerClient): Promise<NewProfilePage> {
  const [styles, substyles] = await Promise.all([
    client.from('music_styles').select('name'),
    client.from('music_substyles').select('style,name'),
  ])
  return { taxonomia: mapTaxonomy(unwrap(styles), unwrap(substyles)) }
}

export async function createProfile(client: SupabaseServerClient, form: URLSearchParams): Promise<Outcome> {
  // Integrante de coletivo sem nome informado usa o nome da própria conta.
  let fallbackName = ''
  if (form.get('tipo') === 'integrante' && !(form.get('atuacaoNome') ?? '').trim()) {
    const account = await client.rpc('get_my_account_details')
    const name = (account.data as { name?: unknown } | null)?.name
    if (typeof name === 'string') fallbackName = name
  }
  const parsed = parseNewProfileForm(form, fallbackName)
  if (!parsed.ok) return fail('create-profile', parsed.errors, { values: parsed.values })
  const { data: id, error, status } = await client.rpc('create_profile', { payload: parsed.payload as unknown as Json })
  if (error) {
    if (status === 401) return expired('create-profile')
    if (error.code === '42501') return fail('create-profile', {}, { message: 'Esta conta não pode criar atuações.', status: 403 })
    if (error.code === '22023')
      return fail('create-profile', {}, { message: 'O banco recusou os dados da atuação. Revise os campos e tente de novo.', status: 422, values: profileValues(form) })
    return fail('create-profile', {}, { message: UNAVAILABLE, status: 503 })
  }
  return { redirectTo: `/painel/perfil/${id}` }
}

export const newProfileAction = (request: Request) =>
  flowAction(request, '/painel/dados/nova-atuacao', async ({ client, form }) => createProfile(client, form))
