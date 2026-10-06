import { ESTADOS, type AtuacaoTipo } from '../data/types'
import { normalizePhone, PASSWORD_MAX, PASSWORD_MIN, type FieldErrors, type FormValues, type Parsed } from './account-forms'
import type { Taxonomia } from '../server/mappers/account-settings'
import { birthdateStatus, normalizeCpf, validEmail } from './registration-validation'

/**
 * Cadastro (e-mail, celular, dados e primeira atuação) e nova atuação. Validação no servidor, antes de qualquer chamada
 * ao Auth ou ao banco; o banco continua a autoridade (RPCs `complete_registration` e `create_profile`).
 * As chaves dos erros são os `name` dos campos; mensagens em pt-BR.
 */

export type FlowIntent =
  | 'signup'
  | 'resend-email'
  | 'send-phone'
  | 'resend-phone'
  | 'verify-phone'
  | 'complete'
  | 'create-profile'

/** Resultado de uma ação: o sucesso só existe depois de o Auth ou o RPC responder sem erro. */
export type FlowResult =
  | { ok: true; intent: FlowIntent; message: string; email?: string; cooldown?: number }
  | { ok: false; intent: FlowIntent | null; message: string | null; errors: FieldErrors; values?: FormValues; cooldown?: number }

export type { FieldErrors, FormValues, Parsed }

const UFS: readonly string[] = ESTADOS.map((estado) => estado.value)
const text = (form: URLSearchParams, key: string) => (form.get(key) ?? '').trim()
const echo = (form: URLSearchParams, keys: string[]): FormValues => Object.fromEntries(keys.map((key) => [key, text(form, key)]))
const failure = (errors: FieldErrors, values: FormValues): Parsed<never> | null =>
  Object.keys(errors).length ? { ok: false, errors, values } : null

// ---- Etapa de cadastro a partir do estado real ----

export type RegistrationStep = 'account' | 'email' | 'phone' | 'code' | 'data'

/** O que o Auth informa sobre a identidade (`getUser`); só os campos que decidem a etapa. */
export type FlowUser = { email_confirmed_at?: string | null; phone_confirmed_at?: string | null; new_phone?: string | null }

/**
 * Etapa em que o cadastro retoma: sem sessão, criar a conta; e-mail não confirmado, esperar a confirmação; celular não
 * confirmado, informá-lo (ou digitar o código, se já há um envio pendente); os dois confirmados, os dados e a atuação.
 * Quem já concluiu o cadastro nem chega aqui: a conta é ativa e a rota redireciona para o painel.
 */
export function registrationStep(user: FlowUser | null | undefined): RegistrationStep {
  if (!user) return 'account'
  if (!user.email_confirmed_at) return 'email'
  if (!user.phone_confirmed_at) return user.new_phone ? 'code' : 'phone'
  return 'data'
}

/** Aviso trazido pelo callback de confirmação (`/cadastro?confirmacao=...`). */
export type RegistrationNotice = 'invalida' | 'indisponivel'
export type RegistrationPage =
  | { preview: true }
  | { step: 'account'; notice: RegistrationNotice | null }
  | { step: 'email'; email: string; notice: RegistrationNotice | null }
  | { step: 'phone'; email: string }
  | { step: 'code'; email: string; phone: string }
  | { step: 'data'; email: string; phone: string; requestId: string; taxonomia: Taxonomia }

// ---- Conta (e-mail e senha) ----

export function parseSignupForm(form: URLSearchParams): Parsed<{ email: string; password: string }> {
  const errors: FieldErrors = {}
  const email = text(form, 'email')
  const password = form.get('senha') ?? ''
  if (!validEmail(email)) errors.email = 'Informe um e-mail válido.'
  if (password.length < PASSWORD_MIN) errors.senha = `Use ao menos ${PASSWORD_MIN} caracteres.`
  else if (password.length > PASSWORD_MAX) errors.senha = `Use no máximo ${PASSWORD_MAX} caracteres.`
  if (password !== (form.get('conf') ?? '')) errors.conf = 'As senhas não coincidem.'
  return failure(errors, { email }) ?? { ok: true, payload: { email, password } }
}

export function parseResendEmailForm(form: URLSearchParams): Parsed<{ email: string }> {
  const email = text(form, 'email')
  return validEmail(email) ? { ok: true, payload: { email } } : { ok: false, errors: { email: 'Informe um e-mail válido.' }, values: { email } }
}

// ---- Celular ----

/** Celular móvel brasileiro em E.164: `+55`, DDD e nove dígitos começando por 9 (o SMS só vai para o Brasil). */
export function normalizeBrazilianMobile(input: string): string | null {
  const phone = normalizePhone(input)
  return phone && /^\+55[1-9]{2}9\d{8}$/.test(phone) ? phone : null
}

export function parsePhoneForm(form: URLSearchParams): Parsed<{ phone: string }> {
  const raw = text(form, 'telefone')
  const phone = normalizeBrazilianMobile(raw)
  return phone ? { ok: true, payload: { phone } } : { ok: false, errors: { telefone: 'Informe um celular brasileiro com DDD, ex.: 81 99999-0001.' }, values: { telefone: raw } }
}

export function parseCodeForm(form: URLSearchParams): Parsed<{ code: string }> {
  const code = text(form, 'codigo').replace(/\s/g, '')
  return /^\d{6}$/.test(code) ? { ok: true, payload: { code } } : { ok: false, errors: { codigo: 'Informe o código de 6 dígitos recebido por SMS.' }, values: {} }
}

// ---- Atuação (primeira ou nova) ----

export const PROFILE_KINDS = [
  { value: 'artista', db: 'artist', label: 'Artista', desc: 'DJ, produtor, live act' },
  { value: 'servicos', db: 'services', label: 'Serviços', desc: 'estrutura, som, luzes, performances' },
  { value: 'audiovisual', db: 'audiovisual', label: 'Audiovisual', desc: 'foto, vídeo, som' },
  { value: 'integrante', db: 'member', label: 'Integrante de coletivo', desc: 'coletivo ou produtora' },
] as const satisfies readonly { value: AtuacaoTipo; db: string; label: string; desc: string }[]

export type NewProfilePayload = { kind: string; name: string; styles?: { style: string; substyle: string | null }[] }

/** Estilos vêm como `estilo` ou `estilo|subestilo` (nenhum nome da taxonomia contém "|"). */
function parseStyles(form: URLSearchParams, errors: FieldErrors): { style: string; substyle: string | null }[] {
  const selected = [...new Set(form.getAll('estilo').map((value) => value.trim()).filter(Boolean))]
  if (selected.length === 0) errors.estilo = 'Escolha ao menos um estilo.'
  else if (selected.length > 50) errors.estilo = 'Escolha no máximo 50 estilos.'
  return selected.map((value) => {
    const [style, ...rest] = value.split('|')
    return { style, substyle: rest.length ? rest.join('|') : null }
  })
}

/**
 * Tipo, nome e (para artistas) estilos. Cidade e estado da atuação vêm da conta, no banco. `fallbackName` completa o
 * nome de integrante de coletivo, que por padrão usa o nome da própria pessoa.
 */
export function parseProfileFields(form: URLSearchParams, fallbackName = ''): Parsed<NewProfilePayload> {
  const errors: FieldErrors = {}
  const kind = PROFILE_KINDS.find((item) => item.value === text(form, 'tipo'))
  let name = text(form, 'atuacaoNome')
  if (!kind) errors.tipo = 'Escolha o tipo de atuação.'
  if (!name && kind?.value === 'integrante') name = fallbackName
  if (!name) errors.atuacaoNome = 'Informe o nome da atuação.'
  else if (name.length > 200) errors.atuacaoNome = 'Use até 200 caracteres.'
  const styles = kind?.value === 'artista' ? parseStyles(form, errors) : []
  const failed = failure(errors, profileValues(form))
  if (failed) return failed
  return { ok: true, payload: { kind: kind!.db, name, ...(kind!.value === 'artista' ? { styles } : {}) } }
}

export const parseNewProfileForm = (form: URLSearchParams, fallbackName = '') => parseProfileFields(form, fallbackName)

/** Valores digitados do formulário de atuação, devolvidos junto com um erro (nunca senhas nem códigos). */
export const profileValues = (form: URLSearchParams): FormValues => ({
  ...echo(form, ['tipo', 'atuacaoNome']),
  estilo: [...new Set(form.getAll('estilo').map((value) => value.trim()).filter(Boolean))],
})

// ---- Dados pessoais ----

/** Valores digitados do formulário de dados e atuação, devolvidos junto com um erro. */
export const registrationValues = (form: URLSearchParams): FormValues => ({
  ...echo(form, ['nome', 'cpf', 'nascimento', 'genero', 'cidade', 'estado', 'whatsapp', 'whatsappNumero']),
  ...profileValues(form),
})

/** E.164 brasileiro no formato de exibição (+55 (81) 99999-0001); outros formatos ficam como estão. */
export function formatBrazilianPhone(e164: string): string {
  const match = /^\+55(\d{2})(\d{4,5})(\d{4})$/.exec(e164)
  return match ? `+55 (${match[1]}) ${match[2]}-${match[3]}` : e164
}

export type RegistrationPayload = {
  account: {
    name: string
    cpf: string
    birth_date: string
    gender: string | null
    city: string
    state_code: string
    phone_is_whatsapp: boolean
    whatsapp_number: string | null
  }
  profile: NewProfilePayload
  requestId: string
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Dados da conta e primeira atuação (RN-01, RN-03, RN-04, RN-31, RN-36). `phone` é o celular confirmado (E.164): o
 * WhatsApp "outro número" não pode repeti-lo. `requestId` é o identificador de renderização do formulário (idempotência).
 */
export function parseRegistrationForm(form: URLSearchParams, phone: string, today = new Date()): Parsed<RegistrationPayload> {
  const errors: FieldErrors = {}
  const name = text(form, 'nome')
  const cpfInput = text(form, 'cpf')
  const birth = text(form, 'nascimento')
  const gender = text(form, 'genero')
  const city = text(form, 'cidade')
  const state = text(form, 'estado')
  const whatsapp = text(form, 'whatsapp')
  const number = text(form, 'whatsappNumero')
  const requestId = text(form, 'requestId')

  if (!name) errors.nome = 'Informe seu nome completo.'
  else if (name.length > 200) errors.nome = 'Use até 200 caracteres.'
  const cpf = normalizeCpf(cpfInput)
  if (!cpfInput) errors.cpf = 'Informe o CPF.'
  else if (!cpf) errors.cpf = 'Informe um CPF válido.'
  const status = birth ? birthdateStatus(birth, today) : 'invalid'
  if (!birth) errors.nascimento = 'Informe a data de nascimento.'
  else if (status === 'invalid') errors.nascimento = 'Informe uma data de nascimento válida.'
  else if (status === 'underage') errors.nascimento = 'É necessário ter 18 anos completos.'
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
  if (!UUID.test(requestId)) errors.requestId = 'O formulário expirou. Recarregue a página e tente de novo.'
  const profile = parseProfileFields(form, name)
  if (!profile.ok) Object.assign(errors, profile.errors)

  const failed = failure(errors, registrationValues(form))
  if (failed || !profile.ok) return failed ?? { ok: false, errors, values: registrationValues(form) }
  return {
    ok: true,
    payload: {
      account: {
        name,
        cpf: cpf!,
        birth_date: birth,
        gender: gender || null,
        city,
        state_code: state,
        phone_is_whatsapp: whatsapp === 'same',
        whatsapp_number: whatsappNumber,
      },
      profile: profile.payload,
      requestId,
    },
  }
}
