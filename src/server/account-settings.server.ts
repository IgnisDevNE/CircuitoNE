import { data, redirect } from 'react-router'
import type { Json } from '../types/database.generated'
import {
  CONFIRM_DELETE_ACCOUNT,
  CONFIRM_DELETE_PROFILE,
  parseAccountForm,
  parseConfirmation,
  parseEmailForm,
  parseMfaCode,
  parsePasswordForm,
  parseProfessionalForm,
  parseProfileForm,
  type ActionResult,
  type FieldErrors,
  type FormIntent,
  type FormValues,
  type MfaEnrollment,
} from '../lib/account-forms'
import { GALLERY_MAX, DOCUMENT_MAX_BYTES } from '../lib/uploads'
import { boundedBody, readAccountSession, type UploadedFiles } from './auth.server'
import { ActionFailure, UPLOAD_TIMEOUT_MS } from './mutation.server'
import { readUpload, removeStored, returnedPath, storeUpload } from './storage.server'
import { confirmationUrl } from './registration.server'
import {
  mapAccountDetails,
  mapMyProfile,
  mapTaxonomy,
  type ContaDados,
  type PerfilEdicao,
  type SegurancaDados,
  type Taxonomia,
} from './mappers/account-settings'
import {
  createSupabaseServerClient,
  HttpError,
  privateHeaders,
  unavailable,
  unwrap,
  type SupabaseServerClient,
} from './supabase.server'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const UNAVAILABLE = 'Serviço temporariamente indisponível. Tente novamente.'

// ---- Loaders ----

export type AccountDataPage = { conta: ContaDados | null }

/** `/painel/dados`: conta ativa devolve os dados; conta restrita devolve `null` (o layout mostra o aviso). */
export async function loadAccountData(client: SupabaseServerClient): Promise<AccountDataPage> {
  return { conta: mapAccountDetails(unwrap(await client.rpc('get_my_account_details'))) }
}

export type ProfileEditPage = { perfil: PerfilEdicao | null; taxonomia: Taxonomia }

const notFound = () => new HttpError(404, 'Atuação não encontrada.')

/**
 * `/painel/perfil/:atuacaoId`: só o titular lê a própria atuação. Id inválido ou de outra conta => 404 (sem distinguir),
 * exceto quando a conta não está ativa: aí o resultado é vazio e o layout mostra o aviso de conta restrita.
 */
export async function loadProfileEdit(client: SupabaseServerClient, id: string): Promise<ProfileEditPage> {
  if (!UUID.test(id)) throw notFound()
  const perfil = mapMyProfile(unwrap(await client.rpc('get_my_profile', { target: id })))
  if (!perfil) {
    const session = unwrap(await client.rpc('get_account_session')) as { state?: unknown } | null
    if (session?.state !== 'active') return { perfil: null, taxonomia: [] }
    throw notFound()
  }
  if (perfil.tipo !== 'artista') return { perfil, taxonomia: [] }
  const [styles, substyles] = await Promise.all([
    client.from('music_styles').select('name'),
    client.from('music_substyles').select('style,name'),
  ])
  return { perfil, taxonomia: mapTaxonomy(unwrap(styles), unwrap(substyles)) }
}

export type SecurityPage = { seguranca: SegurancaDados | null }

/** `/painel/seguranca`: e-mail atual (validado no Auth), fatores TOTP verificados e se falta a confirmação do segundo fator. */
export async function loadSecurity(client: SupabaseServerClient): Promise<SecurityPage> {
  const { data: user, error } = await client.auth.getUser()
  // Sem sessão o Auth responde 4xx (o layout já redireciona); falha de rede ou 5xx é indisponibilidade.
  if (error && !(error.status && error.status < 500)) throw unavailable()
  if (!user.user) return { seguranca: null }
  const [factors, assurance] = await Promise.all([client.auth.mfa.listFactors(), client.auth.mfa.getAuthenticatorAssuranceLevel()])
  if (factors.error || assurance.error) throw unavailable()
  return {
    seguranca: {
      email: user.user.email ?? null,
      emailPendente: user.user.new_email ?? null,
      fatores: factors.data.totp.map((factor) => ({
        id: factor.id,
        nome: factor.friendly_name ?? 'Aplicativo autenticador',
        criadoEm: factor.created_at,
      })),
      precisaConfirmar: assurance.data.nextLevel === 'aal2' && assurance.data.currentLevel !== 'aal2',
    },
  }
}

// ---- Actions ----

export type Outcome =
  | { result: ActionResult; status: number }
  | { redirectTo: string }
  | { notFound: string }

const ok = (intent: FormIntent, message: string, extra: { enrollment?: MfaEnrollment } = {}): Outcome => ({
  result: { ok: true, intent, message, ...extra },
  status: 200,
})

const fail = (
  intent: FormIntent | null,
  errors: FieldErrors,
  options: { values?: FormValues; message?: string; status?: number } = {},
): Outcome => ({
  result: { ok: false, intent, message: options.message ?? null, errors, values: options.values },
  status: options.status ?? 400,
})

type RpcError = { code?: string; message?: string }

/** Erros de RPC: nossas mensagens (22023/55000) são mostradas; o resto vira texto genérico. */
function rpcFailure(intent: FormIntent, error: RpcError): Outcome {
  if (error.code === '42501') return fail(intent, {}, { message: 'Esta operação não é permitida para a sua conta.', status: 403 })
  if ((error.code === '22023' || error.code === '55000') && error.message)
    return fail(intent, {}, { message: error.message, status: error.code === '55000' ? 409 : 400 })
  return fail(intent, {}, { message: UNAVAILABLE, status: 503 })
}

export type ActionContext = { client: SupabaseServerClient; form: URLSearchParams; files: UploadedFiles; request: Request }

/** Ação com origem verificada (`APP_ORIGIN`), corpo limitado, sessão revalidada no servidor e respostas privadas. */
export async function accountAction(
  request: Request,
  handle: (context: ActionContext) => Promise<Outcome>,
  /** `limit`: corpo urlencoded; `uploadLimit`: corpo multipart (só as ações que recebem arquivo). */
  options: { limit?: number; uploadLimit?: number } = {},
) {
  const headers = privateHeaders()
  const reply = (result: ActionResult, status: number) => data(result, { status, headers })
  const deny = (status: number, message: string) => reply({ ok: false, intent: null, message, errors: {} }, status)
  if (request.method !== 'POST') return deny(405, 'Operação indisponível.')
  // A origem externa vem da configuração; não confiar em cabeçalhos forwarded do cliente.
  if (
    !process.env.APP_ORIGIN ||
    request.headers.get('origin') !== process.env.APP_ORIGIN ||
    request.headers.get('sec-fetch-site') === 'cross-site'
  )
    return deny(403, 'Origem recusada.')
  let outcome: Outcome
  try {
    const { form, files } = await boundedBody(request, options)
    const client = createSupabaseServerClient(request, headers, options.uploadLimit ? { timeoutMs: UPLOAD_TIMEOUT_MS } : {})
    const session = await readAccountSession(client, request, headers)
    if (session.kind === 'error') return deny(503, session.message)
    if (session.kind === 'anonymous') return redirect('/entrar', { headers, status: 303 })
    if (session.account.state !== 'active') return deny(403, 'Esta conta não pode realizar esta operação.')
    outcome = await handle({ client, form, files, request })
  } catch (error) {
    if (error instanceof Response) return deny(error.status, error.status === 413 ? 'Dados grandes demais.' : 'Formato de envio não aceito.')
    return deny(503, UNAVAILABLE)
  }
  if ('redirectTo' in outcome) return redirect(outcome.redirectTo, { headers, status: 303 })
  if ('notFound' in outcome) throw data({ message: outcome.notFound }, { status: 404, headers })
  return reply(outcome.result, outcome.status)
}

const intentOf = (form: URLSearchParams) => form.get('intent') ?? ''
const unknownIntent = () => fail(null, {}, { message: 'Operação indisponível.', status: 400 })

// -- /painel/dados --

export async function saveAccount(client: SupabaseServerClient, form: URLSearchParams): Promise<Outcome> {
  const current = mapAccountDetails(unwrap(await client.rpc('get_my_account_details')))
  if (!current) return fail('save-account', {}, { message: 'Esta conta não pode ser editada.', status: 403 })
  const parsed = parseAccountForm(form, current.celular)
  if (!parsed.ok) return fail('save-account', parsed.errors, { values: parsed.values })
  const { error } = await client.rpc('update_my_account_details', { payload: parsed.payload })
  if (error) return rpcFailure('save-account', error)
  return ok('save-account', 'Dados atualizados.')
}

export const accountDataAction = (request: Request) =>
  accountAction(request, async ({ client, form }) =>
    intentOf(form) === 'save-account' ? saveAccount(client, form) : unknownIntent(),
  )

// -- /painel/perfil/:atuacaoId --

async function ownedProfile(client: SupabaseServerClient, id: string) {
  return UUID.test(id) ? mapMyProfile(unwrap(await client.rpc('get_my_profile', { target: id }))) : null
}

export async function saveProfile(client: SupabaseServerClient, profile: PerfilEdicao, form: URLSearchParams): Promise<Outcome> {
  const parsed = parseProfileForm(form, profile.tipo)
  if (!parsed.ok) return fail('save-profile', parsed.errors, { values: parsed.values })
  const { error } = await client.rpc('update_my_profile', { target: profile.id, payload: parsed.payload as Json })
  if (error) return rpcFailure('save-profile', error)
  return ok('save-profile', 'Perfil atualizado.')
}

const PROFESSIONAL_FIELDS = ['emailBooking', 'emailContato', 'telefoneContato', 'cache', 'cnpj', 'presskit', 'portfolio', 'tipoServico', 'servicoOutro', 'tipoAudiovisual']
const professionalValues = (form: URLSearchParams): FormValues =>
  Object.fromEntries(PROFESSIONAL_FIELDS.map((key) => [key, (form.get(key) ?? '').trim()]))

export async function saveProfessional(client: SupabaseServerClient, profile: PerfilEdicao, form: URLSearchParams): Promise<Outcome> {
  if (profile.tipo === 'integrante')
    return fail('save-professional', {}, { message: 'Esta atuação não tem dados profissionais.' })
  const parsed = parseProfessionalForm(form, profile.tipo)
  if (!parsed.ok) return fail('save-professional', parsed.errors, { values: parsed.values })
  // Presskit é um link ou um PDF, nunca os dois (RN-35); o banco também recusa, mas aqui a mensagem aponta o campo.
  if (parsed.payload.presskit_url && profile.profissional?.presskitPdfBytes != null)
    return fail('save-professional', { presskit: 'Remova o PDF do presskit antes de informar um link.' }, { values: professionalValues(form) })
  const { error } = await client.rpc('update_my_professional_details', { target: profile.id, payload: parsed.payload as Json })
  if (error) return rpcFailure('save-professional', error)
  return ok('save-professional', 'Dados profissionais atualizados.')
}

export async function removeProfile(client: SupabaseServerClient, profile: PerfilEdicao, form: URLSearchParams): Promise<Outcome> {
  const confirmation = parseConfirmation(form, CONFIRM_DELETE_PROFILE)
  if (!confirmation.ok) return fail('delete-profile', confirmation.errors)
  const { error } = await client.rpc('delete_profile', { target: profile.id })
  if (error) return rpcFailure('delete-profile', error)
  return { redirectTo: '/painel/dados' }
}

// -- Fotos e documentos (W11) --

const UPLOAD_INTENTS = ['upload-photo', 'upload-gallery', 'upload-document'] as const
const FILE_INTENTS = [...UPLOAD_INTENTS, 'remove-photo', 'remove-gallery', 'move-gallery', 'remove-document'] as const

/** Falha do Storage ou das conferências do envio vira mensagem no campo do arquivo; o resto, indisponibilidade. */
function uploadFailure(intent: FormIntent, error: unknown): Outcome {
  if (error instanceof ActionFailure) return fail(intent, error.status === 422 ? { arquivo: error.message } : {}, { message: error.status === 422 ? undefined : error.message, status: error.status })
  return fail(intent, {}, { message: UNAVAILABLE, status: 503 })
}

/** Foto principal (substitui a anterior) ou imagem da galeria (até 10); só artistas (RN-09). */
export async function uploadImage(client: SupabaseServerClient, profile: PerfilEdicao, files: UploadedFiles, slot: 'main' | 'gallery'): Promise<Outcome> {
  const intent = slot === 'main' ? 'upload-photo' : 'upload-gallery'
  if (profile.tipo !== 'artista') return fail(intent, {}, { message: 'Somente atuações de artista têm fotos.', status: 400 })
  if (slot === 'gallery' && profile.imagens.filter((image) => image.posicao >= 1).length >= GALLERY_MAX)
    return fail(intent, { arquivo: `A galeria aceita até ${GALLERY_MAX} imagens. Remova uma para enviar outra.` }, { status: 409 })
  const upload = await readUpload(files, 'arquivo', 'image')
  if (!upload.ok) return fail(intent, { arquivo: upload.error }, { status: 422 })
  let path: string
  try {
    path = await storeUpload(client, 'image', profile.id, upload)
  } catch (error) {
    return uploadFailure(intent, error)
  }
  const { data: attached, error } = await client.rpc('attach_profile_image', { target: profile.id, slot, object_path: path })
  if (error) {
    // A referência não foi gravada: o objeto recém-enviado não serve a ninguém.
    await removeStored(client, 'image', [path])
    return rpcFailure(intent, error)
  }
  await removeStored(client, 'image', [returnedPath(attached, 'replaced_path')])
  return ok(intent, slot === 'main' ? 'Foto principal atualizada.' : 'Imagem adicionada à galeria.')
}

export async function removeImage(client: SupabaseServerClient, profile: PerfilEdicao, form: URLSearchParams, intent: 'remove-photo' | 'remove-gallery'): Promise<Outcome> {
  const image = form.get('imagem') ?? ''
  if (!UUID.test(image)) return fail(intent, {}, { message: 'Imagem inválida. Recarregue a página.' })
  const { data: removed, error } = await client.rpc('detach_profile_image', { target: profile.id, image })
  if (error) return rpcFailure(intent, error)
  await removeStored(client, 'image', [returnedPath(removed)])
  return ok(intent, intent === 'remove-photo' ? 'Foto principal removida.' : 'Imagem removida da galeria.')
}

export async function moveGalleryImage(client: SupabaseServerClient, profile: PerfilEdicao, form: URLSearchParams): Promise<Outcome> {
  const image = form.get('imagem') ?? ''
  const direction = form.get('direcao') ?? ''
  if (!UUID.test(image) || !['earlier', 'later'].includes(direction)) return fail('move-gallery', {}, { message: 'Imagem inválida. Recarregue a página.' })
  const { error } = await client.rpc('move_profile_image', { target: profile.id, image, direction })
  if (error) return rpcFailure('move-gallery', error)
  return ok('move-gallery', 'Ordem da galeria atualizada.')
}

/** Documento do tipo da atuação (RN-35): presskit em PDF para artista; lista de serviços/equipamentos para serviços. */
const documentKind = (profile: PerfilEdicao) => (profile.tipo === 'artista' ? 'presskit' : profile.tipo === 'servicos' ? 'services' : null)

export async function uploadDocument(client: SupabaseServerClient, profile: PerfilEdicao, files: UploadedFiles): Promise<Outcome> {
  const kind = documentKind(profile)
  if (!kind) return fail('upload-document', {}, { message: 'Esta atuação não tem documento para enviar.', status: 400 })
  const upload = await readUpload(files, 'arquivo', 'document')
  if (!upload.ok) return fail('upload-document', { arquivo: upload.error }, { status: 422 })
  let path: string
  try {
    path = await storeUpload(client, 'document', profile.id, upload)
  } catch (error) {
    return uploadFailure('upload-document', error)
  }
  const { data: previous, error } = await client.rpc('set_professional_document', { target: profile.id, kind, object_path: path })
  if (error) {
    await removeStored(client, 'document', [path])
    return rpcFailure('upload-document', error)
  }
  await removeStored(client, 'document', [returnedPath(previous)])
  return ok(
    'upload-document',
    kind === 'presskit' ? 'Presskit em PDF enviado. O link do presskit, se havia, foi removido.' : 'Lista de serviços e equipamentos enviada.',
  )
}

export async function removeDocument(client: SupabaseServerClient, profile: PerfilEdicao): Promise<Outcome> {
  const kind = documentKind(profile)
  if (!kind) return fail('remove-document', {}, { message: 'Esta atuação não tem documento para remover.', status: 400 })
  // O banco aceita caminho nulo para remover; os tipos gerados não o marcam como opcional.
  const { data: previous, error } = await client.rpc('set_professional_document', { target: profile.id, kind, object_path: null as unknown as string })
  if (error) return rpcFailure('remove-document', error)
  await removeStored(client, 'document', [returnedPath(previous)])
  return ok('remove-document', 'Documento removido.')
}

/** Ações da página de edição: a atuação precisa ser do titular (senão 404) antes de qualquer escrita. */
export const profileAction = (request: Request, id: string) =>
  accountAction(
    request,
    async ({ client, form, files }) => {
      const intent = intentOf(form)
      if (!['save-profile', 'save-professional', 'delete-profile', ...FILE_INTENTS].includes(intent)) return unknownIntent()
      const profile = await ownedProfile(client, id)
      if (!profile) return { notFound: 'Atuação não encontrada.' }
      switch (intent) {
        case 'save-profile':
          return saveProfile(client, profile, form)
        case 'save-professional':
          return saveProfessional(client, profile, form)
        case 'upload-photo':
          return uploadImage(client, profile, files, 'main')
        case 'upload-gallery':
          return uploadImage(client, profile, files, 'gallery')
        case 'remove-photo':
        case 'remove-gallery':
          return removeImage(client, profile, form, intent)
        case 'move-gallery':
          return moveGalleryImage(client, profile, form)
        case 'upload-document':
          return uploadDocument(client, profile, files)
        case 'remove-document':
          return removeDocument(client, profile)
        default:
          return removeProfile(client, profile, form)
      }
    },
    // Formulários de texto: 128 KiB. Com arquivo (multipart): o maior PDF (10 MB) mais os campos e a moldura do envio.
    { limit: 128 * 1024, uploadLimit: DOCUMENT_MAX_BYTES + 64 * 1024 },
  )

// -- /painel/seguranca --

/** Resultado da checagem da senha atual. */
export type PasswordCheck = 'ok' | 'wrong' | 'limited' | 'unavailable'
export type PasswordVerifier = (email: string, password: string) => Promise<PasswordCheck>

/**
 * Reconfere a senha atual com um cliente descartável (sem cookies, sem gravar sessão): a sessão do titular, inclusive
 * o nível de MFA (aal2), fica intacta. A sessão criada pela checagem é encerrada em seguida.
 */
export const passwordVerifier =
  (request: Request): PasswordVerifier =>
  async (email, password) => {
    const probe = createSupabaseServerClient(new Request(request.url), new Headers())
    const { error } = await probe.auth.signInWithPassword({ email, password })
    if (error) {
      if (error.status === 429) return 'limited'
      return error.status !== undefined && error.status < 500 ? 'wrong' : 'unavailable'
    }
    await probe.auth.signOut({ scope: 'local' }).catch(() => undefined)
    return 'ok'
  }

type AuthFailure = { code?: string; status?: number; message?: string }

const MFA_REQUIRED = 'Confirme o código do aplicativo autenticador (seção "autenticação em dois fatores") e tente de novo.'
const RATE_LIMITED = 'Muitas tentativas. Aguarde alguns minutos e tente de novo.'

function authFailure(intent: FormIntent, error: AuthFailure): Outcome {
  if (error.code === 'insufficient_aal') return fail(intent, {}, { message: MFA_REQUIRED, status: 403 })
  if (error.status === 429 || error.code === 'over_request_rate_limit' || error.code === 'over_email_send_rate_limit')
    return fail(intent, {}, { message: RATE_LIMITED, status: 429 })
  return fail(intent, {}, { message: UNAVAILABLE, status: 503 })
}

export async function changePassword(client: SupabaseServerClient, form: URLSearchParams, verify: PasswordVerifier): Promise<Outcome> {
  const parsed = parsePasswordForm(form)
  if (!parsed.ok) return fail('change-password', parsed.errors)
  const { data: user } = await client.auth.getUser()
  if (!user.user?.email) return fail('change-password', {}, { message: UNAVAILABLE, status: 503 })
  const check = await verify(user.user.email, parsed.payload.current)
  if (check === 'wrong') return fail('change-password', { atual: 'Senha atual incorreta.' })
  if (check === 'limited') return fail('change-password', {}, { message: RATE_LIMITED, status: 429 })
  if (check === 'unavailable') return fail('change-password', {}, { message: UNAVAILABLE, status: 503 })
  const { error } = await client.auth.updateUser({ password: parsed.payload.next })
  if (error) {
    if (error.code === 'same_password') return fail('change-password', { nova: 'A nova senha deve ser diferente da atual.' })
    if (error.code === 'weak_password') return fail('change-password', { nova: 'Senha fraca: escolha uma senha mais difícil de adivinhar.' })
    return authFailure('change-password', error)
  }
  return ok('change-password', 'Senha alterada.')
}

export async function changeEmail(client: SupabaseServerClient, form: URLSearchParams): Promise<Outcome> {
  const { data: user } = await client.auth.getUser()
  if (!user.user) return fail('change-email', {}, { message: UNAVAILABLE, status: 503 })
  const parsed = parseEmailForm(form, user.user.email ?? null)
  if (!parsed.ok) return fail('change-email', parsed.errors, { values: parsed.values })
  const { error } = await client.auth.updateUser({ email: parsed.payload.email }, { emailRedirectTo: confirmationUrl() })
  if (error) {
    // Não confirma se o endereço já pertence a outra conta.
    if (error.code === 'email_exists' || error.code === 'email_address_invalid')
      return fail('change-email', {}, { message: 'Não foi possível solicitar a troca para este e-mail. Confira o endereço ou use outro.', values: { email: parsed.payload.email } })
    return authFailure('change-email', error)
  }
  return ok(
    'change-email',
    `Enviamos um link de confirmação para ${parsed.payload.email}. O e-mail da conta só muda depois da confirmação.`,
  )
}

const MFA_UNAVAILABLE = 'A autenticação em dois fatores não está disponível neste ambiente.'
const BAD_CODE = 'Código inválido ou expirado. Confira o horário do celular e tente de novo.'

function mfaFailure(intent: FormIntent, error: AuthFailure): Outcome {
  if (['mfa_verification_failed', 'mfa_verification_rejected', 'mfa_challenge_expired', 'validation_failed'].includes(error.code ?? ''))
    return fail(intent, { codigo: BAD_CODE })
  if (error.code === 'mfa_totp_enroll_not_enabled' || error.code === 'mfa_totp_verify_not_enabled')
    return fail(intent, {}, { message: MFA_UNAVAILABLE, status: 501 })
  return authFailure(intent, error)
}

const QR_PREFIX = 'data:image/svg+xml;utf-8,'

/** Cria um fator TOTP novo (descartando cadastros inacabados) e devolve segredo e QR para o aplicativo autenticador. */
export async function enrollMfa(client: SupabaseServerClient): Promise<Outcome> {
  const listed = await client.auth.mfa.listFactors()
  if (listed.error) return fail('mfa-enroll', {}, { message: UNAVAILABLE, status: 503 })
  for (const factor of listed.data.all)
    if (factor.factor_type === 'totp' && factor.status === 'unverified') await client.auth.mfa.unenroll({ factorId: factor.id })
  const enrolled = await client.auth.mfa.enroll({
    factorType: 'totp',
    friendlyName: `App autenticador ${crypto.randomUUID().slice(0, 4)}`,
    issuer: 'CircuitoNE',
  })
  if (enrolled.error) return mfaFailure('mfa-enroll', enrolled.error)
  const { id, totp } = enrolled.data
  return ok('mfa-enroll', 'Cadastre o código no aplicativo autenticador e confirme com o código de 6 dígitos.', {
    enrollment: { factorId: id, secret: totp.secret, uri: totp.uri, qr: totp.qr_code.startsWith('data:') ? totp.qr_code : QR_PREFIX + totp.qr_code },
  })
}

/**
 * Reconstrói o cadastro em andamento (sem o QR) a partir do que o formulário devolveu, só se tiver o formato esperado.
 * O QR do Auth é um SVG grande (dezenas de KB): não volta pelo formulário, senão estoura o limite do corpo e a
 * conexão cai. A página mantém o QR que já recebeu; sem JavaScript, o titular usa a chave.
 */
export function enrollmentFromForm(form: URLSearchParams): MfaEnrollment | undefined {
  const secret = form.get('segredo') ?? ''
  const uri = form.get('uri') ?? ''
  const factorId = form.get('factorId') ?? ''
  if (!/^[A-Z2-7]{16,128}$/.test(secret) || !uri.startsWith('otpauth://totp/') || uri.length > 1024 || !UUID.test(factorId)) return undefined
  return { factorId, secret, uri, qr: '' }
}

export async function verifyMfa(client: SupabaseServerClient, form: URLSearchParams): Promise<Outcome> {
  const parsed = parseMfaCode(form)
  if (!parsed.ok) return withEnrollment(fail('mfa-verify', parsed.errors), enrollmentFromForm(form))
  const { error } = await client.auth.mfa.challengeAndVerify({ factorId: parsed.payload.factorId, code: parsed.payload.code })
  if (error) return withEnrollment(mfaFailure('mfa-verify', error), enrollmentFromForm(form))
  return ok('mfa-verify', 'Autenticação em dois fatores ativada.')
}

/** Mantém o QR na tela quando a confirmação falha, para o titular tentar de novo sem recomeçar. */
function withEnrollment(outcome: Outcome, enrollment: MfaEnrollment | undefined): Outcome {
  if (!('result' in outcome) || outcome.result.ok || !enrollment) return outcome
  return { ...outcome, result: { ...outcome.result, enrollment } }
}

/** Confirma o segundo fator na sessão atual (aal1 -> aal2). */
export async function elevateMfa(client: SupabaseServerClient, form: URLSearchParams): Promise<Outcome> {
  const parsed = parseMfaCode(form)
  if (!parsed.ok) return fail('mfa-elevate', parsed.errors)
  const { error } = await client.auth.mfa.challengeAndVerify({ factorId: parsed.payload.factorId, code: parsed.payload.code })
  if (error) return mfaFailure('mfa-elevate', error)
  return ok('mfa-elevate', 'Sessão confirmada com o segundo fator.')
}

/** Remover um fator verificado exige o código atual dele (o Auth também exige sessão aal2). */
export async function removeMfa(client: SupabaseServerClient, form: URLSearchParams): Promise<Outcome> {
  const parsed = parseMfaCode(form)
  if (!parsed.ok) return fail('mfa-remove', parsed.errors)
  const verified = await client.auth.mfa.challengeAndVerify({ factorId: parsed.payload.factorId, code: parsed.payload.code })
  if (verified.error) return mfaFailure('mfa-remove', verified.error)
  const { error } = await client.auth.mfa.unenroll({ factorId: parsed.payload.factorId })
  if (error) return mfaFailure('mfa-remove', error)
  return ok('mfa-remove', 'Autenticação em dois fatores removida.')
}

/** Abandona um cadastro de TOTP ainda não confirmado. Fatores verificados só saem por `removeMfa`. */
export async function cancelMfa(client: SupabaseServerClient, form: URLSearchParams): Promise<Outcome> {
  const factorId = form.get('factorId') ?? ''
  if (!UUID.test(factorId)) return fail('mfa-cancel', {}, { message: 'Fator de autenticação inválido.' })
  const listed = await client.auth.mfa.listFactors()
  if (listed.error) return fail('mfa-cancel', {}, { message: UNAVAILABLE, status: 503 })
  if (!listed.data.all.some((factor) => factor.id === factorId && factor.status === 'unverified'))
    return fail('mfa-cancel', {}, { message: 'Este cadastro já foi concluído ou não existe mais.' })
  const { error } = await client.auth.mfa.unenroll({ factorId })
  if (error) return mfaFailure('mfa-cancel', error)
  return ok('mfa-cancel', 'Cadastro cancelado.')
}

/** Pedido de exclusão (RN-34): confirmação digitada; o layout passa a mostrar o aviso de exclusão pendente. */
export async function requestDeletion(client: SupabaseServerClient, form: URLSearchParams): Promise<Outcome> {
  const confirmation = parseConfirmation(form, CONFIRM_DELETE_ACCOUNT)
  if (!confirmation.ok) return fail('request-deletion', confirmation.errors)
  const { error } = await client.rpc('request_account_deletion')
  if (error) return rpcFailure('request-deletion', error)
  return { redirectTo: '/painel' }
}

export const securityAction = (request: Request) =>
  accountAction(
    request,
    async ({ client, form, request: current }) => {
      switch (intentOf(form)) {
        case 'change-password':
          return changePassword(client, form, passwordVerifier(current))
        case 'change-email':
          return changeEmail(client, form)
        case 'mfa-enroll':
          return enrollMfa(client)
        case 'mfa-verify':
          return verifyMfa(client, form)
        case 'mfa-elevate':
          return elevateMfa(client, form)
        case 'mfa-remove':
          return removeMfa(client, form)
        case 'mfa-cancel':
          return cancelMfa(client, form)
        case 'request-deletion':
          return requestDeletion(client, form)
        default:
          return unknownIntent()
      }
    },
    { limit: 64 * 1024 },
  )
