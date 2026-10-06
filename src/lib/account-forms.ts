import { ESTADOS, type AtuacaoTipo } from '../data/types'
import { validEmail } from './registration-validation'
import { parseCacheCents } from './utils'

/**
 * Leitura e validação dos formulários da conta (dados, atuação, segurança). Roda no servidor, antes de qualquer
 * chamada ao banco ou ao Auth; as mesmas regras existem como constraints no banco, que continua sendo a autoridade.
 * Mensagens em pt-BR; as chaves dos erros são os `name` dos campos do formulário.
 */

export type FieldErrors = Record<string, string>
/** Valores devolvidos ao formulário após um erro (nunca senhas nem códigos). */
export type FormValues = Record<string, string | string[]>
export type Parsed<T> = { ok: true; payload: T } | { ok: false; errors: FieldErrors; values: FormValues }

export type FormIntent =
  | 'save-account'
  | 'save-profile'
  | 'save-professional'
  | 'delete-profile'
  | 'change-password'
  | 'change-email'
  | 'mfa-enroll'
  | 'mfa-verify'
  | 'mfa-elevate'
  | 'mfa-remove'
  | 'mfa-cancel'
  | 'request-deletion'

/** Dados de um fator TOTP recém-criado, mostrados uma única vez para o cadastro no aplicativo autenticador. */
export type MfaEnrollment = { factorId: string; secret: string; uri: string; qr: string }

export type ActionResult =
  | { ok: true; intent: FormIntent; message: string; enrollment?: MfaEnrollment }
  | { ok: false; intent: FormIntent | null; message: string | null; errors: FieldErrors; values?: FormValues; enrollment?: MfaEnrollment }

export const CONFIRM_DELETE_ACCOUNT = 'EXCLUIR MINHA CONTA'
export const CONFIRM_DELETE_PROFILE = 'EXCLUIR'

const UFS: readonly string[] = ESTADOS.map((estado) => estado.value)
const text = (form: URLSearchParams, key: string) => (form.get(key) ?? '').trim()

const URL_PATTERN = /^https?:\/\/[^\s/?#@]+([/?#]\S*)?$/

/** Endereço web completo (http/https, sem credenciais, até 2048 caracteres), como exige o banco. */
export function normalizeUrl(input: string): string | null {
  const value = input.trim()
  return value.length <= 2048 && URL_PATTERN.test(value) ? value : null
}

/** Telefone em E.164. Sem "+", aceita número brasileiro (DDD + 8 ou 9 dígitos), com ou sem o 55. */
export function normalizePhone(input: string): string | null {
  const raw = input.trim()
  if (!/^[+\d\s().-]+$/.test(raw)) return null
  const digits = raw.replace(/\D/g, '')
  if (raw.startsWith('+')) return /^[1-9]\d{7,14}$/.test(digits) ? `+${digits}` : null
  if (/^[1-9]{2}9?\d{8}$/.test(digits)) return `+55${digits}`
  if (/^55[1-9]{2}9?\d{8}$/.test(digits)) return `+${digits}`
  return null
}

/** CNPJ (inclusive o alfanumérico): 12 caracteres + 2 dígitos, sem pontuação. */
export function normalizeCnpj(input: string): string | null {
  const value = input.replace(/[.\-/\s]/g, '').toUpperCase()
  return /^[A-Z0-9]{12}[0-9]{2}$/.test(value) ? value : null
}

const echo = (form: URLSearchParams, keys: string[]): FormValues =>
  Object.fromEntries(keys.map((key) => [key, text(form, key)]))

const failure = (errors: FieldErrors, values: FormValues): Parsed<never> | null =>
  Object.keys(errors).length ? { ok: false, errors, values } : null

// ---- Dados da conta ----

export type AccountPayload = {
  name: string
  gender: string | null
  city: string
  state_code: string
  phone_is_whatsapp: boolean
  whatsapp_number: string | null
}

/** RN-36: o celular é WhatsApp, é outro número ou não há WhatsApp. `phone` é o celular confirmado (E.164). */
export function parseAccountForm(form: URLSearchParams, phone: string): Parsed<AccountPayload> {
  const errors: FieldErrors = {}
  const name = text(form, 'nome')
  const gender = text(form, 'genero')
  const city = text(form, 'cidade')
  const state = text(form, 'estado')
  const whatsapp = text(form, 'whatsapp')
  const number = text(form, 'whatsappNumero')
  if (!name) errors.nome = 'Informe seu nome completo.'
  else if (name.length > 200) errors.nome = 'Use até 200 caracteres.'
  if (gender.length > 100) errors.genero = 'Use até 100 caracteres.'
  if (!city) errors.cidade = 'Informe a cidade.'
  else if (city.length > 150) errors.cidade = 'Use até 150 caracteres.'
  if (!UFS.includes(state)) errors.estado = 'Escolha o estado.'
  let whatsappNumber: string | null = null
  if (!['same', 'other', 'none'].includes(whatsapp)) errors.whatsapp = 'Escolha uma opção.'
  else if (whatsapp === 'other') {
    whatsappNumber = normalizePhone(number)
    if (!whatsappNumber) errors.whatsappNumero = 'Informe um número válido, com DDD (ex.: 81 99999-0000).'
    else if (whatsappNumber === phone) {
      errors.whatsapp = 'Este é o mesmo número do celular: escolha "meu celular também é WhatsApp".'
      whatsappNumber = null
    }
  }
  const failed = failure(errors, echo(form, ['nome', 'genero', 'cidade', 'estado', 'whatsapp', 'whatsappNumero']))
  if (failed) return failed
  return {
    ok: true,
    payload: {
      name,
      gender: gender || null,
      city,
      state_code: state,
      phone_is_whatsapp: whatsapp === 'same',
      whatsapp_number: whatsappNumber,
    },
  }
}

// ---- Atuação ----

export const SOCIAL_FIELDS = ['instagram', 'bandcamp', 'soundcloud', 'facebook', 'site', 'youtube'] as const
const SOCIAL_DB_KEY = { site: 'website' } as const

export type ProfilePayload = {
  name: string
  description: string
  city: string
  state_code: string
  color: string | null
  social_links: Record<string, string>
  published?: boolean
  styles?: { style: string; substyle: string | null }[]
}

/** Estilos são enviados como `estilo` ou `estilo|subestilo` (nenhum nome da taxonomia contém "|"). */
export const encodeStyle = (estilo: string, subestilo?: string) => (subestilo ? `${estilo}|${subestilo}` : estilo)

export function parseProfileForm(form: URLSearchParams, kind: AtuacaoTipo): Parsed<ProfilePayload> {
  const errors: FieldErrors = {}
  const name = text(form, 'nome')
  const description = form.get('descricao') ?? ''
  const city = text(form, 'cidade')
  const state = text(form, 'estado')
  const color = text(form, 'cor')
  if (!name) errors.nome = 'Informe o nome da atuação.'
  else if (name.length > 200) errors.nome = 'Use até 200 caracteres.'
  if (description.length > 10000) errors.descricao = 'Use até 10.000 caracteres.'
  if (!city) errors.cidade = 'Informe a cidade.'
  else if (city.length > 150) errors.cidade = 'Use até 150 caracteres.'
  if (!UFS.includes(state)) errors.estado = 'Escolha o estado.'
  const useColor = form.has('usarCor')
  if (useColor && !/^#[0-9a-fA-F]{6}$/.test(color)) errors.cor = 'Escolha uma cor válida.'
  const social: Record<string, string> = {}
  for (const key of SOCIAL_FIELDS) {
    const value = text(form, key)
    if (!value) continue
    const url = normalizeUrl(value)
    if (url) social[SOCIAL_DB_KEY[key as keyof typeof SOCIAL_DB_KEY] ?? key] = url
    else errors[key] = 'Informe o endereço completo, começando por https://'
  }
  const payload: ProfilePayload = {
    name,
    description,
    city,
    state_code: state,
    color: useColor ? color.toLowerCase() : null,
    social_links: social,
  }
  const selected = [...new Set(form.getAll('estilo').map((value) => value.trim()).filter(Boolean))]
  if (kind === 'artista') {
    payload.published = form.has('publicado')
    if (selected.length === 0) errors.estilo = 'Escolha ao menos um estilo.'
    else if (selected.length > 50) errors.estilo = 'Escolha no máximo 50 estilos.'
    payload.styles = selected.map((value) => {
      const [style, ...rest] = value.split('|')
      return { style, substyle: rest.length ? rest.join('|') : null }
    })
  }
  const failed = failure(errors, {
    ...echo(form, ['nome', 'cidade', 'estado', 'cor', ...SOCIAL_FIELDS]),
    descricao: description,
    usarCor: useColor ? 'on' : '',
    publicado: form.has('publicado') ? 'on' : '',
    estilo: selected,
  })
  return failed ?? { ok: true, payload }
}

// ---- Dados profissionais ----

export const SERVICE_TYPES = [
  { value: 'structure', label: 'Estrutura' },
  { value: 'sound', label: 'Som' },
  { value: 'lighting', label: 'Luzes' },
  { value: 'performance', label: 'Performances' },
  { value: 'other', label: 'Outros' },
] as const
export const AUDIOVISUAL_TYPES = [
  { value: 'photo', label: 'Fotografia' },
  { value: 'video', label: 'Vídeo' },
  { value: 'full', label: 'Audiovisual completo' },
  { value: 'sound', label: 'Som' },
] as const

export type ProfessionalPayload = Partial<{
  booking_email: string | null
  contact_email: string | null
  contact_phone: string | null
  fee_cents: number | null
  cnpj: string | null
  presskit_url: string | null
  portfolio_url: string | null
  service_type: string | null
  service_other: string | null
  audiovisual_type: string | null
}>

export function parseProfessionalForm(form: URLSearchParams, kind: AtuacaoTipo): Parsed<ProfessionalPayload> {
  const errors: FieldErrors = {}
  const payload: ProfessionalPayload = {}
  const optional = <T>(key: string, parse: (value: string) => T | null, message: string): T | null => {
    const value = text(form, key)
    if (!value) return null
    const parsed = parse(value)
    if (parsed === null) errors[key] = message
    return parsed
  }
  const email = (value: string) => (validEmail(value) ? value : null)
  payload.contact_email = optional('emailContato', email, 'Informe um e-mail válido.')
  payload.contact_phone = optional('telefoneContato', normalizePhone, 'Informe um telefone válido, com DDD (ex.: 81 99999-0000).')
  payload.cnpj = optional('cnpj', normalizeCnpj, 'CNPJ inválido: use 14 caracteres (12 letras ou números e 2 dígitos).')
  if (kind === 'artista') {
    payload.booking_email = optional('emailBooking', email, 'Informe um e-mail válido.')
    payload.fee_cents = optional('cache', parseCacheCents, 'Informe um valor em reais, como R$ 1.500,00.')
    payload.presskit_url = optional('presskit', normalizeUrl, 'Informe o endereço completo, começando por https://')
  } else if (kind === 'audiovisual') {
    payload.portfolio_url = optional('portfolio', normalizeUrl, 'Informe o endereço completo, começando por https://')
    const type = text(form, 'tipoAudiovisual')
    if (type && !AUDIOVISUAL_TYPES.some((option) => option.value === type)) errors.tipoAudiovisual = 'Escolha uma opção da lista.'
    payload.audiovisual_type = type || null
  } else if (kind === 'servicos') {
    const type = text(form, 'tipoServico')
    const other = text(form, 'servicoOutro')
    if (type && !SERVICE_TYPES.some((option) => option.value === type)) errors.tipoServico = 'Escolha uma opção da lista.'
    if (type === 'other') {
      if (!other) errors.servicoOutro = 'Descreva o serviço.'
      else if (other.length > 200) errors.servicoOutro = 'Use até 200 caracteres.'
    }
    payload.service_type = type || null
    payload.service_other = type === 'other' ? other : null
  }
  const failed = failure(
    errors,
    echo(form, ['emailBooking', 'emailContato', 'telefoneContato', 'cache', 'cnpj', 'presskit', 'portfolio', 'tipoServico', 'servicoOutro', 'tipoAudiovisual']),
  )
  return failed ?? { ok: true, payload }
}

// ---- Segurança ----

export const PASSWORD_MIN = 8
export const PASSWORD_MAX = 72

export function parsePasswordForm(form: URLSearchParams): Parsed<{ current: string; next: string }> {
  const errors: FieldErrors = {}
  const current = form.get('atual') ?? ''
  const next = form.get('nova') ?? ''
  const confirmation = form.get('conf') ?? ''
  if (!current) errors.atual = 'Informe a senha atual.'
  if (next.length < PASSWORD_MIN) errors.nova = `Use ao menos ${PASSWORD_MIN} caracteres.`
  else if (next.length > PASSWORD_MAX) errors.nova = `Use no máximo ${PASSWORD_MAX} caracteres.`
  else if (next === current) errors.nova = 'A nova senha deve ser diferente da atual.'
  if (next !== confirmation) errors.conf = 'As senhas não coincidem.'
  return failure(errors, {}) ?? { ok: true, payload: { current, next } }
}

export function parseEmailForm(form: URLSearchParams, currentEmail: string | null): Parsed<{ email: string }> {
  const errors: FieldErrors = {}
  const email = text(form, 'email')
  if (!validEmail(email)) errors.email = 'Informe um e-mail válido.'
  else if (email.toLowerCase() === currentEmail?.toLowerCase()) errors.email = 'Este já é o e-mail da conta.'
  return failure(errors, { email }) ?? { ok: true, payload: { email } }
}

/** Código do aplicativo autenticador: 6 dígitos (espaços são tolerados). */
export function parseMfaCode(form: URLSearchParams): Parsed<{ factorId: string; code: string }> {
  const errors: FieldErrors = {}
  const factorId = text(form, 'factorId')
  const code = text(form, 'codigo').replace(/\s/g, '')
  if (!/^[0-9a-f-]{36}$/i.test(factorId)) errors.codigo = 'Fator de autenticação inválido. Recarregue a página.'
  else if (!/^\d{6}$/.test(code)) errors.codigo = 'Informe o código de 6 dígitos do aplicativo.'
  return failure(errors, {}) ?? { ok: true, payload: { factorId, code } }
}

export function parseConfirmation(form: URLSearchParams, expected: string): Parsed<true> {
  if (text(form, 'confirmacao') === expected) return { ok: true, payload: true }
  return { ok: false, errors: { confirmacao: `Digite ${expected} para confirmar.` }, values: {} }
}
