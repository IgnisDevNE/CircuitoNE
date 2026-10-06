import { ESTADOS, type ArtistaEstilo, type AtuacaoTipo, type Estado, type SocialLinks } from '../../data/types'
import { invalid, isRow, oneOf, optionalText, text, webUrl, type Row } from './row'

const UFS = ESTADOS.map((estado) => estado.value) as Estado[]
const KIND_TIPO = { artist: 'artista', services: 'servicos', audiovisual: 'audiovisual', member: 'integrante' } as const

/** Como o titular informou o WhatsApp (RN-36): o próprio celular, outro número ou nenhum. */
export type WhatsappEscolha = { tipo: 'same' } | { tipo: 'other'; numero: string } | { tipo: 'none' }

/** Dados da conta do titular (`get_my_account_details`). O CPF só chega mascarado. */
export type ContaDados = {
  nome: string
  cpfMascarado: string
  /** AAAA-MM-DD; não editável. */
  nascimento: string
  genero: string | null
  cidade: string
  estado: Estado
  email: string
  /** Celular confirmado, em E.164; não editável aqui. */
  celular: string
  whatsapp: WhatsappEscolha
}

const nullableText = (row: Row, key: string) => {
  const value = row[key]
  if (value === null || value === undefined) return null
  if (typeof value !== 'string') throw invalid()
  return value || null
}

export function mapAccountDetails(row: unknown): ContaDados | null {
  if (row === null) return null
  if (!isRow(row)) throw invalid()
  const isWhatsapp = row.phone_is_whatsapp
  if (typeof isWhatsapp !== 'boolean') throw invalid()
  const number = nullableText(row, 'whatsapp_number')
  if (isWhatsapp && number) throw invalid()
  const birth = text(row, 'birth_date')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(birth)) throw invalid()
  return {
    nome: text(row, 'name'),
    cpfMascarado: text(row, 'cpf_masked'),
    nascimento: birth,
    genero: nullableText(row, 'gender'),
    cidade: text(row, 'city'),
    estado: oneOf(text(row, 'state_code'), UFS),
    email: text(row, 'email'),
    celular: text(row, 'phone'),
    whatsapp: isWhatsapp ? { tipo: 'same' } : number ? { tipo: 'other', numero: number } : { tipo: 'none' },
  }
}

/** Dados profissionais do titular, por tipo (restritos, RN-07). Campos vazios são `null`. */
export type Profissional = {
  emailBooking: string | null
  emailContato: string | null
  telefoneContato: string | null
  cacheCentavos: number | null
  cnpj: string | null
  tipoServico: string | null
  servicoOutro: string | null
  tipoAudiovisual: string | null
  presskit: string | null
  portfolio: string | null
}

/** Atuação do titular com tudo o que a tela de edição precisa (`get_my_profile`). */
export type PerfilEdicao = {
  id: string
  tipo: AtuacaoTipo
  nome: string
  descricao: string
  cidade: string
  estado: Estado
  cor: string | null
  publicado: boolean
  padrao: boolean
  redes: SocialLinks
  estilos: ArtistaEstilo[]
  /** `null` para integrantes, que não têm dados profissionais. */
  profissional: Profissional | null
}

const SOCIAL_KEYS = {
  instagram: 'instagram',
  soundcloud: 'soundcloud',
  bandcamp: 'bandcamp',
  facebook: 'facebook',
  youtube: 'youtube',
  // No banco o endereço do site é `website`; na UI, `site`.
  website: 'site',
} as const satisfies Record<string, keyof SocialLinks>

function mapSocial(value: unknown): SocialLinks {
  if (value === null || value === undefined) return {}
  if (!isRow(value)) throw invalid()
  const links: SocialLinks = {}
  for (const [dbKey, uiKey] of Object.entries(SOCIAL_KEYS)) {
    const url = webUrl(typeof value[dbKey] === 'string' ? (value[dbKey] as string) : undefined)
    if (url) links[uiKey] = url
  }
  return links
}

function mapProfessional(value: unknown): Profissional | null {
  if (value === null || value === undefined) return null
  if (!isRow(value)) throw invalid()
  const fee = value.fee_cents
  if (fee !== null && fee !== undefined && (typeof fee !== 'number' || !Number.isSafeInteger(fee) || fee < 0)) throw invalid()
  return {
    emailBooking: nullableText(value, 'booking_email'),
    emailContato: nullableText(value, 'contact_email'),
    telefoneContato: nullableText(value, 'contact_phone'),
    cacheCentavos: typeof fee === 'number' ? fee : null,
    cnpj: nullableText(value, 'cnpj'),
    tipoServico: nullableText(value, 'service_type'),
    servicoOutro: nullableText(value, 'service_other'),
    tipoAudiovisual: nullableText(value, 'audiovisual_type'),
    presskit: nullableText(value, 'presskit_url'),
    portfolio: nullableText(value, 'portfolio_url'),
  }
}

export function mapMyProfile(row: unknown): PerfilEdicao | null {
  if (row === null) return null
  if (!isRow(row)) throw invalid()
  const published = row.published
  const isDefault = row.is_default
  if (typeof published !== 'boolean' || typeof isDefault !== 'boolean') throw invalid()
  const color = row.color
  if (color !== null && color !== undefined && (typeof color !== 'string' || !/^#[0-9a-f]{6}$/i.test(color))) throw invalid()
  const description = row.description
  if (typeof description !== 'string' || !Array.isArray(row.styles)) throw invalid()
  return {
    id: text(row, 'id'),
    tipo: KIND_TIPO[oneOf(text(row, 'kind'), Object.keys(KIND_TIPO) as (keyof typeof KIND_TIPO)[])],
    nome: text(row, 'name'),
    descricao: description,
    cidade: text(row, 'city'),
    estado: oneOf(text(row, 'state_code'), UFS),
    cor: typeof color === 'string' ? color.toLowerCase() : null,
    publicado: published,
    padrao: isDefault,
    redes: mapSocial(row.social_links),
    estilos: row.styles.map((style: unknown): ArtistaEstilo => {
      if (!isRow(style)) throw invalid()
      const substyle = optionalText(style, 'substyle')
      return substyle ? { estilo: text(style, 'style'), subestilo: substyle } : { estilo: text(style, 'style') }
    }),
    profissional: mapProfessional(row.professional),
  }
}

/** Taxonomia de estilos (`music_styles` + `music_substyles`), em ordem alfabética (pt-BR). */
export type Taxonomia = { estilo: string; subestilos: string[] }[]

export function mapTaxonomy(styles: unknown, substyles: unknown): Taxonomia {
  if (!Array.isArray(styles) || !Array.isArray(substyles)) throw invalid()
  const children = new Map<string, string[]>()
  for (const row of substyles) {
    if (!isRow(row)) throw invalid()
    const style = text(row, 'style')
    children.set(style, [...(children.get(style) ?? []), text(row, 'name')])
  }
  return styles
    .map((row: unknown) => {
      if (!isRow(row)) throw invalid()
      const estilo = text(row, 'name')
      return { estilo, subestilos: [...(children.get(estilo) ?? [])].sort((a, b) => a.localeCompare(b, 'pt-BR')) }
    })
    .sort((a, b) => a.estilo.localeCompare(b.estilo, 'pt-BR'))
}

/** Fator TOTP do titular (`auth.mfa.listFactors`). */
export type FatorMfa = { id: string; nome: string; criadoEm: string }

export type SegurancaDados = {
  email: string | null
  /** Novo e-mail aguardando confirmação (`updateUser({ email })`). */
  emailPendente: string | null
  /** Fatores TOTP verificados (MFA ativa). */
  fatores: FatorMfa[]
  /** Há MFA ativa, mas a sessão ainda não passou pelo segundo fator (aal1). */
  precisaConfirmar: boolean
}
