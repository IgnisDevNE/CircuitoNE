import { ESTADOS, type ArtistaEstilo, type Estado } from '../../data/types'
import { AUDIOVISUAL_TYPES, SERVICE_TYPES } from '../../lib/account-forms'
import { formatCacheCents } from '../../lib/utils'
import { groupArtistStyles } from './artists'
import type { ColetivoPublico } from './collectives'
import { invalid, isRow, oneOf, text, webUrl, type Row } from './row'

/** Catálogo interno (`/painel/explorar/:kind`): uma página por tipo de atuação, mais os coletivos. */
export const EXPLORE_KINDS = ['artistas', 'servicos', 'audiovisual', 'coletivos'] as const
export type ExploreKind = (typeof EXPLORE_KINDS)[number]
export type ExploreProfileKind = Exclude<ExploreKind, 'coletivos'>

/** Tipo de atuação no banco (`profiles.kind`) de cada página do catálogo. */
export const PROFILE_DB_KIND: Record<ExploreProfileKind, 'artist' | 'services' | 'audiovisual'> = {
  artistas: 'artist',
  servicos: 'services',
  audiovisual: 'audiovisual',
}

/**
 * Dados restritos de uma atuação (RN-07): contatos, cachê, presskit/portfólio e o tipo de serviço. Só chegam ao
 * servidor quando o banco os devolve (dono da atuação ou proprietário elegível com MFA); nunca são deduzidos.
 */
export type DadosRestritos = {
  emailBooking?: string
  emailContato?: string
  telefone?: string
  cache?: string
  cnpj?: string
  /** Rótulo do tipo de serviço/audiovisual ("Som", "Outros: …"). */
  tipo?: string
  /** Valor do filtro de tipo (`structure`, `photo`…). */
  tipoValor?: string
  presskit?: string
  portfolio?: string
  /** Há PDF privado enviado (o link passa pela rota que gera o endereço assinado; o caminho nunca sai do servidor). */
  presskitPdf?: true
  listaServicosPdf?: true
}

export type PerfilExplorar = {
  id: string
  nome: string
  descricao: string
  cidade: string
  estado: Estado
  estilos: ArtistaEstilo[]
  /** Atuação do próprio titular (o banco lhe mostra os dados restritos dela). */
  minha: boolean
  restrito: DadosRestritos | null
}

export type ExplorePerfisData = {
  kind: ExploreProfileKind
  perfis: PerfilExplorar[]
  /** Há atuações de outras pessoas sem dados restritos: o leitor não é proprietário elegível com MFA (RN-07). */
  restritoIndisponivel: boolean
}

export type ExploreColetivosData = { kind: 'coletivos'; coletivos: ColetivoPublico[] }
export type ExploreData = ExplorePerfisData | ExploreColetivosData

const UFS = ESTADOS.map((estado) => estado.value) as Estado[]
const TYPE_LABEL: Record<string, string> = Object.fromEntries([...SERVICE_TYPES, ...AUDIOVISUAL_TYPES].map((item) => [item.value, item.label]))

/** Colunas de `profiles` liberadas a contas autenticadas (as demais não são legíveis pela Data API). */
export const EXPLORE_PROFILE_COLUMNS = 'id,name,description,city,state_code'
/** Colunas restritas lidas de `professional_details`, inclusive os caminhos dos PDFs privados (só usados para saber se há arquivo). */
export const EXPLORE_DETAIL_COLUMNS =
  'profile_id,booking_email,contact_email,contact_phone,fee_cents,cnpj,service_type,service_other,audiovisual_type,presskit_url,portfolio_url,presskit_path,services_pdf_path'

function typeLabel(value: string): string {
  const label = TYPE_LABEL[value]
  if (!label) throw invalid()
  return label
}

const optionalString = (row: Row, key: string) => {
  const value = row[key]
  if (value === null || value === undefined) return undefined
  if (typeof value !== 'string') throw invalid()
  return value || undefined
}

/** Linhas de `professional_details` por atuação; o RLS decide quais existem. */
export function mapRestrictedDetails(rows: unknown): Map<string, DadosRestritos> {
  if (!Array.isArray(rows)) throw invalid()
  const byProfile = new Map<string, DadosRestritos>()
  for (const row of rows) {
    if (!isRow(row)) throw invalid()
    const fee = row.fee_cents
    if (fee !== null && fee !== undefined && (typeof fee !== 'number' || !Number.isInteger(fee) || fee < 0)) throw invalid()
    const typeValue = optionalString(row, 'service_type') ?? optionalString(row, 'audiovisual_type')
    const other = optionalString(row, 'service_other')
    const presskit = webUrl(optionalString(row, 'presskit_url'))
    const portfolio = webUrl(optionalString(row, 'portfolio_url'))
    const details: DadosRestritos = {
      ...(optionalString(row, 'booking_email') ? { emailBooking: optionalString(row, 'booking_email') } : {}),
      ...(optionalString(row, 'contact_email') ? { emailContato: optionalString(row, 'contact_email') } : {}),
      ...(optionalString(row, 'contact_phone') ? { telefone: optionalString(row, 'contact_phone') } : {}),
      ...(typeof fee === 'number' ? { cache: formatCacheCents(fee) } : {}),
      ...(optionalString(row, 'cnpj') ? { cnpj: optionalString(row, 'cnpj') } : {}),
      ...(typeValue
        ? { tipoValor: typeValue, tipo: typeValue === 'other' && other ? `Outros: ${other}` : typeLabel(typeValue) }
        : {}),
      ...(presskit ? { presskit } : {}),
      ...(portfolio ? { portfolio } : {}),
      ...(optionalString(row, 'presskit_path') ? { presskitPdf: true as const } : {}),
      ...(optionalString(row, 'services_pdf_path') ? { listaServicosPdf: true as const } : {}),
    }
    byProfile.set(text(row, 'profile_id'), details)
  }
  return byProfile
}

/**
 * Atuações do tipo da página (linhas de `profiles` + `artist_styles` + `professional_details` + ids das atuações do titular).
 * `restritoIndisponivel` é verdadeiro quando alguma atuação de outra pessoa não trouxe linha profissional: o banco só a
 * devolve ao dono ou a um proprietário elegível com MFA, e todo perfil nasce com essa linha.
 */
export function mapExplorePerfis(
  kind: ExploreProfileKind,
  profiles: unknown,
  styles: unknown,
  details: unknown,
  mine: ReadonlySet<string>,
): ExplorePerfisData {
  if (!Array.isArray(profiles)) throw invalid()
  const byStyle = groupArtistStyles(styles)
  const restricted = mapRestrictedDetails(details)
  let hidden = false
  const perfis = profiles.map((row: unknown): PerfilExplorar => {
    if (!isRow(row)) throw invalid()
    const id = text(row, 'id')
    const restrito = restricted.get(id) ?? null
    if (!restrito && !mine.has(id)) hidden = true
    return {
      id,
      nome: text(row, 'name'),
      descricao: typeof row.description === 'string' ? row.description : '',
      cidade: text(row, 'city'),
      estado: oneOf(text(row, 'state_code'), UFS),
      estilos: byStyle.get(id) ?? [],
      minha: mine.has(id),
      restrito,
    }
  })
  return { kind, perfis, restritoIndisponivel: hidden }
}
