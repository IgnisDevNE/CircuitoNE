import { ESTADOS, EVENTO_TIPO_LABEL, type Estado, type EventoTipo } from '../data/types'
import { parseFortalezaDateTime } from './utils'

/**
 * Formulário de evento (RN-24..RN-26): leitura e validação do envio, iguais para criar e editar. Espelham as
 * regras do banco (`public.events` e `create_event`/`update_event`); a autoridade continua sendo o banco.
 * Os nomes dos campos são os do payload do RPC e também as chaves de `fields` nos erros.
 */
export const LINEUP_MAX = 100
export const NAME_MAX = 200
export const DESCRIPTION_MAX = 20000
export const CITY_MAX = 150
export const VENUE_MAX = 500
export const URL_MAX = 2048

const TIPOS = Object.keys(EVENTO_TIPO_LABEL) as EventoTipo[]
const UFS = ESTADOS.map((estado) => estado.value) as Estado[]
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
// Mesma regra de `private.valid_web_url`.
const WEB_URL = /^https?:\/\/[^\s/?#@]+([/?#]\S*)?$/

export type LineupEntry = { artistaId?: string; nome: string }

/** Participação como trafega no formulário: `a:<uuid do artista>` ou `n:<nome livre>`. */
export const encodeLineupEntry = (entry: LineupEntry) => (entry.artistaId ? `a:${entry.artistaId}` : `n:${entry.nome}`)

export type EventPayload = {
  name: string
  kind: EventoTipo
  other_kind: string | null
  description: string
  starts_at: string
  ends_at: string | null
  state_code: Estado
  city: string
  venue: string
  is_free: boolean
  ticket_url: string | null
  cover_url: string | null
  lineup: ({ artist_id: string } | { name: string })[]
}

export type ParsedEventForm = { ok: true; payload: EventPayload } | { ok: false; fields: Record<string, string> }

const length = (value: string) => [...value].length
const isWebUrl = (value: string) => length(value) <= URL_MAX && WEB_URL.test(value)

/** Lê o corpo do formulário e monta o payload de `create_event`/`update_event`, ou os erros por campo. */
export function parseEventForm(form: URLSearchParams): ParsedEventForm {
  const fields: Record<string, string> = {}
  const get = (key: string) => (form.get(key) ?? '').trim()

  const name = get('name')
  if (!name) fields.name = 'Informe o nome do evento.'
  else if (length(name) > NAME_MAX) fields.name = `O nome pode ter até ${NAME_MAX} caracteres.`

  const kind = get('kind')
  if (!(TIPOS as string[]).includes(kind)) fields.kind = 'Escolha o tipo do evento.'
  const otherKind = get('other_kind')
  if (kind === 'outros') {
    if (!otherKind) fields.other_kind = 'Descreva o tipo do evento.'
    else if (length(otherKind) > NAME_MAX) fields.other_kind = `A descrição do tipo pode ter até ${NAME_MAX} caracteres.`
  }

  // O navegador envia quebras de linha como CRLF; o banco conta caracteres.
  const description = (form.get('description') ?? '').replace(/\r\n/g, '\n').trim()
  if (length(description) > DESCRIPTION_MAX) fields.description = `A descrição pode ter até ${DESCRIPTION_MAX.toLocaleString('pt-BR')} caracteres.`

  const startsInput = get('starts_at')
  const endsInput = get('ends_at')
  const startsAt = parseFortalezaDateTime(startsInput)
  const endsAt = endsInput ? parseFortalezaDateTime(endsInput) : null
  if (!startsAt) fields.starts_at = startsInput ? 'Informe uma data e hora de início válidas.' : 'Informe a data e a hora de início.'
  if (endsInput && !endsAt) fields.ends_at = 'Informe uma data e hora de fim válidas.'
  else if (startsAt && endsAt && Date.parse(endsAt) <= Date.parse(startsAt)) fields.ends_at = 'O fim deve ser posterior ao início.'

  const stateCode = get('state_code')
  if (!(UFS as string[]).includes(stateCode)) fields.state_code = 'Escolha o estado.'
  const city = get('city')
  if (!city) fields.city = 'Informe a cidade.'
  else if (length(city) > CITY_MAX) fields.city = `A cidade pode ter até ${CITY_MAX} caracteres.`
  const venue = get('venue')
  if (!venue) fields.venue = 'Informe o local.'
  else if (length(venue) > VENUE_MAX) fields.venue = `O local pode ter até ${VENUE_MAX} caracteres.`

  // Entrada gratuita ou com link externo de ingresso, nunca os dois (RN-26).
  const isFree = form.get('is_free') === 'on'
  const ticket = get('ticket_url')
  if (!isFree) {
    if (!ticket) fields.ticket_url = 'Informe o link de ingresso ou marque o evento como gratuito.'
    else if (!isWebUrl(ticket)) fields.ticket_url = 'Informe um link http:// ou https:// válido.'
  }
  const cover = get('cover_url')
  if (cover && !isWebUrl(cover)) fields.cover_url = 'Informe um link http:// ou https:// válido para a capa.'

  const lineup: EventPayload['lineup'] = []
  const artists = new Set<string>()
  const entries = form.getAll('lineup')
  if (entries.length > LINEUP_MAX) fields.lineup = `O lineup aceita até ${LINEUP_MAX} participações.`
  else
    for (const raw of entries) {
      const value = raw.slice(2).trim()
      if (raw.startsWith('a:') && UUID.test(value)) {
        if (artists.has(value.toLowerCase())) fields.lineup = 'Cada artista aparece uma única vez no lineup.'
        artists.add(value.toLowerCase())
        lineup.push({ artist_id: value })
      } else if (raw.startsWith('n:') && value && length(value) <= NAME_MAX) lineup.push({ name: value })
      else fields.lineup = `Cada participação precisa de um artista ou de um nome de até ${NAME_MAX} caracteres.`
    }

  if (Object.keys(fields).length > 0 || !startsAt) return { ok: false, fields }
  return {
    ok: true,
    payload: {
      name,
      kind: kind as EventoTipo,
      other_kind: kind === 'outros' ? otherKind : null,
      description,
      starts_at: startsAt,
      ends_at: endsAt,
      state_code: stateCode as Estado,
      city,
      venue,
      is_free: isFree,
      ticket_url: isFree ? null : ticket,
      cover_url: cover || null,
      lineup,
    },
  }
}
