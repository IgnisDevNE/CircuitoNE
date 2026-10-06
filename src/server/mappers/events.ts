import { ESTADOS, EVENTO_TIPO_LABEL, type Estado, type Evento, type EventoTipo } from '../../data/types'

export type EventoPeriodo = 'future' | 'ongoing' | 'past'
export type EventoSituacao = 'draft' | 'published' | 'cancelled'
export type EventoDetalhe = { evento: Evento; periodo: EventoPeriodo; situacao: EventoSituacao }
export type EventoColetivo = { id: string; nome: string; cor: string | null }
export type EventListData = { ongoing: Evento[]; future: Evento[] }
export type EventPageData = EventoDetalhe & { coletivo: EventoColetivo | null }

/** Capa neutra servida de `public/` quando o evento não tem imagem. */
export const EVENT_COVER_FALLBACK = '/event-cover-fallback.svg'

const invalid = () => new Error('Resposta inválida do banco de eventos')
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
const instant = (value: string) => {
  const time = Date.parse(value)
  if (Number.isNaN(time)) throw invalid()
  return new Date(time).toISOString()
}
const webUrl = (value: string | undefined) =>
  value && URL.canParse(value) && ['http:', 'https:'].includes(new URL(value).protocol) ? value : undefined
const oneOf = <T extends string>(value: string, allowed: readonly T[]): T => {
  if (!(allowed as readonly string[]).includes(value)) throw invalid()
  return value as T
}

const TIPOS = Object.keys(EVENTO_TIPO_LABEL) as EventoTipo[]
const UFS = ESTADOS.map((estado) => estado.value) as Estado[]

/** Linha de `list_events`: não traz descrição nem line-up. */
export function mapEventListRow(row: unknown): Evento {
  if (!isRow(row)) throw invalid()
  if (typeof row.is_free !== 'boolean') throw invalid()
  const fim = optionalText(row, 'ends_at')
  return {
    id: text(row, 'id'),
    nome: text(row, 'name'),
    tipo: oneOf(text(row, 'kind'), TIPOS),
    tipoOutro: optionalText(row, 'other_kind'),
    descricao: typeof row.description === 'string' ? row.description : '',
    inicio: instant(text(row, 'starts_at')),
    fim: fim ? instant(fim) : null,
    // Na UI `estado` é a UF (`state_code`); `state` do banco é o ciclo de vida.
    estado: oneOf(text(row, 'state_code'), UFS),
    cidade: text(row, 'city'),
    local: text(row, 'venue'),
    coletivoId: text(row, 'collective_id'),
    lineup: [],
    ingressoLink: webUrl(optionalText(row, 'ticket_url')),
    gratuito: row.is_free,
    capa: webUrl(optionalText(row, 'cover_url')) ?? EVENT_COVER_FALLBACK,
  }
}

export function mapEventList(rows: unknown): Evento[] {
  if (!Array.isArray(rows)) throw invalid()
  return rows.map(mapEventListRow)
}

/** Resultado de `get_event`: linha de `events` + `period` + `lineup`. */
export function mapEventDetail(row: unknown): EventoDetalhe {
  if (!isRow(row)) throw invalid()
  const evento = mapEventListRow(row)
  if (!Array.isArray(row.lineup)) throw invalid()
  evento.lineup = row.lineup.map((item: unknown) => {
    if (!isRow(item)) throw invalid()
    const nome = text(item, 'name')
    const artistaId = optionalText(item, 'artist_id')
    return artistaId ? { artistaId, nome } : { nome }
  })
  return {
    evento,
    periodo: oneOf(text(row, 'period'), ['future', 'ongoing', 'past'] as const),
    situacao: oneOf(text(row, 'state'), ['draft', 'published', 'cancelled'] as const),
  }
}
