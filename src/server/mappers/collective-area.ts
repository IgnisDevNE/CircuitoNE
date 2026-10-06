import type { AtuacaoTipo } from '../../data/types'
import { isPermission, type CollectiveAccess } from '../../lib/collective-access'
import type { ColetivoSituacao, MeuColetivo, MeuPerfil } from './account'
import type { ColetivoPublico } from './collectives'
import { instant, invalid, isRow, oneOf, optionalText, text, type Row } from './row'

/** Coletivo aberto na área interna, com o cargo do titular e a cor de destaque. */
export type ColetivoArea = {
  id: string
  nome: string
  tipo: 'coletivo' | 'produtora'
  cidade: string
  estado: MeuColetivo['estado']
  cargo: string
  dono: boolean
  cor: string
}

/** Situações em que as funções internas ficam bloqueadas (RN-30); `closed` nunca chega à área (a lista do titular o omite). */
export type SituacaoBloqueada = Exclude<ColetivoSituacao, 'approved' | 'closed'>

export type CollectiveAreaData =
  | { status: 'available'; coletivo: ColetivoArea; permissoes: CollectiveAccess['permissoes']; pendentes: number | null }
  | { status: 'unavailable'; coletivo: ColetivoArea; situacao: SituacaoBloqueada; motivo: string | null }

export type SituacaoEvento = 'draft' | 'published' | 'cancelled'
export type PeriodoEvento = 'ongoing' | 'future' | 'past'

/** Evento do coletivo no painel interno: inclui rascunhos e cancelados para quem edita. */
export type EventoGestao = {
  id: string
  nome: string
  situacao: SituacaoEvento
  periodo: PeriodoEvento
  inicio: string
  fim: string | null
}

export type ResumoMensagens = { conversas: number; naoLidas: number }

export type PedidoEntrada = {
  id: string
  criadoEm: string
  mensagem: string
  /** Nome da conta de quem pede. */
  nome: string
  atuacao: { id: string; nome: string; tipo: AtuacaoTipo; publicada: boolean } | null
}

export type SituacaoPedido = 'pending' | 'approved' | 'rejected' | 'cancelled'
export type MeuPedido = { id: string; coletivoId: string; situacao: SituacaoPedido; criadoEm: string }

export type ColetivoDisponivel = Pick<ColetivoPublico, 'id' | 'nome' | 'tipo' | 'cidade' | 'estado'> & { pendente: boolean }

const KIND_TIPO: Record<string, AtuacaoTipo> = { artist: 'artista', services: 'servicos', audiovisual: 'audiovisual', member: 'integrante' }

/** Texto que pode ser vazio (a mensagem de um pedido é opcional). */
const anyText = (row: Row, key: string) => {
  const value = row[key]
  if (typeof value !== 'string') throw invalid()
  return value
}

/** `get_collective_access`: nulo quando a conta não é membro de um coletivo aprovado. */
export function mapCollectiveAccess(value: unknown): CollectiveAccess | null {
  if (value === null || value === undefined) return null
  if (!isRow(value) || typeof value.owner !== 'boolean' || !Array.isArray(value.permissions)) throw invalid()
  if (!value.permissions.every(isPermission)) throw invalid()
  return { dono: value.owner, permissoes: [...new Set(value.permissions)] }
}

/** Motivo da decisão de `get_collective_status` (só o proprietário o recebe). */
export function mapDecisionReason(value: unknown): string | null {
  if (!isRow(value)) throw invalid()
  return optionalText(value, 'reason') ?? null
}

/** Linhas de `list_collective_events` (gestão) de um período já conhecido pela consulta. */
export function mapManagedEvents(rows: unknown, periodo: PeriodoEvento): EventoGestao[] {
  if (!Array.isArray(rows)) throw invalid()
  return rows.map((row: unknown) => {
    if (!isRow(row)) throw invalid()
    const fim = optionalText(row, 'ends_at')
    return {
      id: text(row, 'id'),
      nome: text(row, 'name'),
      situacao: oneOf(text(row, 'state'), ['draft', 'published', 'cancelled'] as const),
      periodo,
      inicio: instant(text(row, 'starts_at')),
      fim: fim ? instant(fim) : null,
    }
  })
}

/** Linhas de `list_conversations` que têm o coletivo como um dos lados: quantas são e quantas mensagens não foram lidas. */
export function summarizeCollectiveConversations(rows: unknown, collectiveId: string): ResumoMensagens {
  if (!Array.isArray(rows)) throw invalid()
  const summary: ResumoMensagens = { conversas: 0, naoLidas: 0 }
  for (const row of rows as unknown[]) {
    if (!isRow(row)) throw invalid()
    const unread = row.unread_count
    if (typeof unread !== 'number' || !Number.isInteger(unread) || unread < 0) throw invalid()
    const isSide = (side: unknown) => isRow(side) && side.kind === 'collective' && side.id === collectiveId
    if (isSide(row.side_a) || isSide(row.side_b)) {
      summary.conversas += 1
      summary.naoLidas += unread
    }
  }
  return summary
}

/** Linhas de `list_collective_requests`: só pedidos pendentes, com a conta e a atuação escolhida por quem pede. */
export function mapRequestQueue(rows: unknown): PedidoEntrada[] {
  if (!Array.isArray(rows)) throw invalid()
  return rows.map((row: unknown) => {
    if (!isRow(row)) throw invalid()
    const profileId = optionalText(row, 'profile_id')
    return {
      id: text(row, 'id'),
      criadoEm: instant(text(row, 'created_at')),
      mensagem: anyText(row, 'message'),
      nome: text(row, 'requester_name'),
      atuacao: profileId
        ? {
            id: profileId,
            nome: text(row, 'profile_name'),
            tipo: KIND_TIPO[oneOf(text(row, 'profile_kind'), Object.keys(KIND_TIPO))],
            publicada: row.profile_published === true,
          }
        : null,
    }
  })
}

/** Linhas de `get_my_collective_requests`. */
export function mapMyRequests(rows: unknown): MeuPedido[] {
  if (!Array.isArray(rows)) throw invalid()
  return rows.map((row: unknown) => {
    if (!isRow(row)) throw invalid()
    return {
      id: text(row, 'id'),
      coletivoId: text(row, 'collective_id'),
      situacao: oneOf(text(row, 'state'), ['pending', 'approved', 'rejected', 'cancelled'] as const),
      criadoEm: instant(text(row, 'created_at')),
    }
  })
}

export type PedidoListado = MeuPedido & { coletivoNome: string | null }

/** Dados de `/painel/coletivos`. */
export type MyCollectivesData = {
  coletivos: MeuColetivo[]
  /** Atuações do titular, para escolher qual apresentar ao pedir entrada. */
  perfis: MeuPerfil[]
  /** Pendentes primeiro, depois os mais recentes. */
  pedidos: PedidoListado[]
  /** Coletivos aprovados em que o titular ainda não é membro. */
  disponiveis: ColetivoDisponivel[]
}
