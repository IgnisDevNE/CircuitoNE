import { ESTADOS, type Estado, type Evento, type SocialLinks } from '../../data/types'
import { publicImageUrl } from '../public-image'
import { invalid, isRow, oneOf, optionalText, text, webUrl } from './row'

/** Campos do coletivo que a página pública usa (cargos/membros/solicitações são privados e vêm de RPCs próprias). */
export interface ColetivoPublico {
  id: string
  nome: string
  tipo: 'coletivo' | 'produtora'
  /** Eventos Musicais, Culturais, Serviços, Artistas: uma etiqueta por item. */
  atuacao: string[]
  bio: string
  imagem: string
  cidade: string
  estado: Estado
  corPredominante: string
  social: SocialLinks
}
export type MembroPublico = { nome: string; artistaId?: string }
export type CollectiveListData = { coletivos: ColetivoPublico[] }
export type CollectivePageData = {
  coletivo: ColetivoPublico
  membros: MembroPublico[]
  /** Em andamento e futuros, do mais próximo para o mais distante. */
  proximos: Evento[]
  /** Encerrados, do mais recente para o mais antigo. */
  anteriores: Evento[]
}

/** Imagem neutra servida de `public/` para coletivos sem imagem enviada. */
export const COLLECTIVE_IMAGE_FALLBACK = '/collective-cover-fallback.svg'
/** Destaque padrão quando o coletivo não escolheu cor (mesmo valor usado nas páginas de evento). */
export const DEFAULT_ACCENT = '#ff2040'

const UFS = ESTADOS.map((estado) => estado.value) as Estado[]
const SOCIAL_KEYS = ['instagram', 'soundcloud', 'bandcamp', 'facebook', 'youtube'] as const

/** `activity` é um texto único no banco ("Eventos Musicais, Artistas"); a UI mostra uma etiqueta por item. */
export function splitActivity(activity: string): string[] {
  return activity
    .split(/[,;]/)
    .map((item) => item.trim())
    .filter(Boolean)
}

/** `social_links` guarda `website`; a UI chama de `site`. Apenas URLs http(s) passam. */
export function mapSocialLinks(value: unknown): SocialLinks {
  if (!isRow(value)) throw invalid()
  const links: SocialLinks = {}
  for (const key of SOCIAL_KEYS) {
    const url = typeof value[key] === 'string' ? webUrl(value[key]) : undefined
    if (url) links[key] = url
  }
  const site = typeof value.website === 'string' ? webUrl(value.website) : undefined
  if (site) links.site = site
  return links
}

/** Linha de `public.collectives` com as colunas liberadas ao anon. */
export function mapCollectiveRow(row: unknown): ColetivoPublico {
  if (!isRow(row)) throw invalid()
  const color = optionalText(row, 'color')
  return {
    id: text(row, 'id'),
    nome: text(row, 'name'),
    tipo: oneOf(text(row, 'kind'), ['collective', 'producer'] as const) === 'producer' ? 'produtora' : 'coletivo',
    atuacao: splitActivity(text(row, 'activity')),
    bio: text(row, 'description'),
    // `image_path` é um caminho do bucket público `public-images`; sem imagem (ou caminho inválido), a imagem neutra.
    imagem: publicImageUrl(optionalText(row, 'image_path')) ?? COLLECTIVE_IMAGE_FALLBACK,
    cidade: text(row, 'city'),
    // Na UI `estado` é a UF (`state_code`).
    estado: oneOf(text(row, 'state_code'), UFS),
    corPredominante: color && /^#[0-9a-f]{6}$/i.test(color) ? color : DEFAULT_ACCENT,
    social: mapSocialLinks(row.social_links),
  }
}

export function mapCollectiveList(rows: unknown): ColetivoPublico[] {
  if (!Array.isArray(rows)) throw invalid()
  return rows.map(mapCollectiveRow)
}

/** Resultado de `get_collective_members`: nome + perfil de artista publicado (ou null). */
export function mapCollectiveMembers(rows: unknown): MembroPublico[] {
  if (!Array.isArray(rows)) throw invalid()
  return rows.map((item: unknown) => {
    if (!isRow(item)) throw invalid()
    const nome = text(item, 'name')
    const artistaId = optionalText(item, 'artist_profile_id')
    return artistaId ? { nome, artistaId } : { nome }
  })
}
