import {
  ESTADOS,
  type ArtistaEstilo,
  type ArtistaPublico,
  type ArtistaResumo,
  type Estado,
  type Evento,
  type SocialLinks,
} from '../../data/types'

export type ArtistListData = { artistas: ArtistaResumo[] }
export type ArtistPageData = { artista: ArtistaPublico; proximos: Evento[]; anteriores: Evento[] }

/** Foto neutra servida de `public/` até os uploads (Storage) serem ligados. */
export const ARTIST_PHOTO_FALLBACK = '/artist-photo-fallback.svg'

const invalid = () => new Error('Resposta inválida do banco de artistas')
type Row = Record<string, unknown>

const isRow = (value: unknown): value is Row =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const text = (row: Row, key: string) => {
  const value = row[key]
  if (typeof value !== 'string' || !value) throw invalid()
  return value
}
const optionalText = (row: Row, key: string) => {
  const value = row[key]
  if (value === null || value === undefined) return undefined
  if (typeof value !== 'string') throw invalid()
  return value || undefined
}
const webUrl = (value: unknown) =>
  typeof value === 'string' && URL.canParse(value) && ['http:', 'https:'].includes(new URL(value).protocol)
    ? value
    : undefined

const UFS = ESTADOS.map((estado) => estado.value) as readonly string[]
const uf = (row: Row) => {
  const value = text(row, 'state_code')
  if (!UFS.includes(value)) throw invalid()
  return value as Estado
}

/** Colunas de `profiles` liberadas ao visitante: id, name, description, city, state_code. */
const summaryBase = (row: Row) => ({
  id: text(row, 'id'),
  nome: text(row, 'name'),
  // `description` pode ser vazia no banco.
  bio: typeof row.description === 'string' ? row.description : '',
  cidade: text(row, 'city'),
  estado: uf(row),
  foto: ARTIST_PHOTO_FALLBACK,
})

function mapStyle(row: unknown): ArtistaEstilo {
  if (!isRow(row)) throw invalid()
  const subestilo = optionalText(row, 'substyle')
  // Rótulos canônicos da taxonomia: o banco guarda exatamente os nomes de `estilos-musicais.json`.
  return subestilo ? { estilo: text(row, 'style'), subestilo } : { estilo: text(row, 'style') }
}

/** Linhas de `artist_styles` (`profile_id`, `style`, `substyle`) agrupadas por artista, na ordem recebida. */
export function groupArtistStyles(rows: unknown): Map<string, ArtistaEstilo[]> {
  if (!Array.isArray(rows)) throw invalid()
  const grouped = new Map<string, ArtistaEstilo[]>()
  for (const row of rows) {
    if (!isRow(row)) throw invalid()
    const id = text(row, 'profile_id')
    grouped.set(id, [...(grouped.get(id) ?? []), mapStyle(row)])
  }
  return grouped
}

/** Lista pública: linhas de `profiles` (colunas liberadas) + estilos agrupados. A ordem é a do banco. */
export function mapArtistSummaries(profiles: unknown, styles: unknown): ArtistaResumo[] {
  if (!Array.isArray(profiles)) throw invalid()
  const byArtist = groupArtistStyles(styles)
  return profiles.map((row: unknown) => {
    if (!isRow(row)) throw invalid()
    const base = summaryBase(row)
    return { ...base, estilos: byArtist.get(base.id) ?? [] }
  })
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
    const url = webUrl(value[dbKey])
    if (url) links[uiKey] = url
  }
  return links
}

/**
 * Resultado de `get_profile` (linha de `profiles` sem `owner_id`) + estilos do artista.
 * Devolve `null` para perfis que não são de artista, que não têm página pública.
 */
export function mapArtistProfile(row: unknown, styles: unknown): ArtistaPublico | null {
  if (!isRow(row)) throw invalid()
  if (row.kind !== 'artist') return null
  if (!Array.isArray(styles)) throw invalid()
  const color = typeof row.color === 'string' && /^#[0-9a-f]{6}$/i.test(row.color) ? row.color : undefined
  return {
    ...summaryBase(row),
    estilos: styles.map(mapStyle),
    corPredominante: color,
    fotos: [],
    social: mapSocial(row.social_links),
  }
}
