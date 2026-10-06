import type { Estado, EventoTipo } from '../../data/types'
import type { LineupEntry } from '../../lib/event-form'
import { mapEventDetail, type EventoPeriodo, type EventoSituacao } from './events'
import { invalid, isRow, optionalText, text } from './row'

/** Evento aberto na gestão: todos os campos editáveis, com a versão usada no controle de concorrência. */
export type EventoGerido = {
  id: string
  coletivoId: string
  situacao: EventoSituacao
  periodo: EventoPeriodo
  versao: number
  nome: string
  tipo: EventoTipo
  tipoOutro: string
  descricao: string
  inicio: string
  fim: string | null
  estado: Estado
  cidade: string
  local: string
  gratuito: boolean
  ingressoLink: string
  /** Endereço da capa informado; vazio quando o evento usa a capa padrão. */
  capa: string
  lineup: LineupEntry[]
  /** Quando o evento publicado foi reagendado (RN-27), se foi. */
  reagendadoEm: string | null
}

/** O que a conta pode fazer com o evento, conforme as permissões e o estado atual (RN-23, RN-27). */
export type EventActions = { editar: boolean; publicar: boolean; cancelar: boolean }

/** Artista público que pode entrar no lineup. */
export type ArtistaOpcao = { id: string; nome: string }

/** Resultado de `get_event` para quem edita: inclui rascunhos e cancelados, com a versão atual. */
export function mapManagedEvent(row: unknown): EventoGerido {
  const detail = mapEventDetail(row)
  if (!isRow(row)) throw invalid()
  const version = row.version
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) throw invalid()
  const { evento } = detail
  const rescheduled = optionalText(row, 'rescheduled_at')
  if (rescheduled !== undefined && Number.isNaN(Date.parse(rescheduled))) throw invalid()
  return {
    id: evento.id,
    coletivoId: evento.coletivoId,
    situacao: detail.situacao,
    periodo: detail.periodo,
    versao: version,
    nome: evento.nome,
    tipo: evento.tipo,
    tipoOutro: evento.tipoOutro ?? '',
    descricao: evento.descricao,
    inicio: evento.inicio,
    fim: evento.fim,
    estado: evento.estado,
    cidade: evento.cidade,
    local: evento.local,
    gratuito: evento.gratuito,
    ingressoLink: evento.ingressoLink ?? '',
    capa: optionalText(row, 'cover_url') ?? '',
    lineup: evento.lineup.map((item) => (item.artistaId ? { artistaId: item.artistaId, nome: item.nome } : { nome: item.nome })),
    reagendadoEm: rescheduled ? new Date(rescheduled).toISOString() : null,
  }
}

/** Linhas de `profiles` (id, name) dos artistas publicados, para o seletor do lineup. */
export function mapArtistOptions(rows: unknown): ArtistaOpcao[] {
  if (!Array.isArray(rows)) throw invalid()
  return rows.map((row: unknown) => {
    if (!isRow(row)) throw invalid()
    return { id: text(row, 'id'), nome: text(row, 'name') }
  })
}
