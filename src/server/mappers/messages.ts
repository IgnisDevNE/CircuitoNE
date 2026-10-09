import { partyKey, type Party, type PartyKind } from '../../lib/messages'
import { instant, invalid, isRow, oneOf, text, type Row } from './row'

/** Uma das pontas de uma conversa: uma atuação ou um coletivo. `id` é nulo quando a ponta não existe mais ("Atuação excluída"). */
export type Lado = { kind: PartyKind; id: string | null; nome: string }

/** Linha de `list_conversations`. Os cursores ficam como o banco os devolveu: um `Date` perderia os microssegundos. */
export type Conversa = {
  id: string
  atualizadaEm: string
  cursor: string
  lados: [Lado, Lado]
  bloqueada: boolean
  arquivada: boolean
  naoLidas: number
}

export type MensagemUltima = { texto: string; criadaEm: string; autor: Lado }

/** Linha de `get_conversation_details`: última mensagem e quem bloqueou. */
export type DetalheConversa = { ultima: MensagemUltima | null; bloqueadaPor: Lado[] }

/** Linha de `get_messages` / `get_recent_messages`. */
export type Mensagem = { id: string; texto: string; criadaEm: string; cursor: string; autor: Lado }

/** Quem envia e para quem, entre as pontas da conversa que pertencem ao titular. */
export type Remetente = { de: Lado; para: Lado }

/** Conversa pronta para a tela, do ponto de vista de quem a lê (pessoa ou coletivo). */
export type ConversaItem = {
  id: string
  titulo: string
  atualizadaEm: string
  bloqueada: boolean
  bloqueadaPorMim: boolean
  /** A ponta do titular que criou o bloqueio: só ela o remove. */
  bloqueadaComo: Lado | null
  arquivada: boolean
  naoLidas: number
  remetentes: Remetente[]
  /** Pontas do titular na conversa; mais de uma quando ele conversa consigo mesmo (duas atuações). */
  meus: Lado[]
  ultima: (MensagemUltima & { minha: boolean }) | null
}

export type ConversaAberta = {
  conversa: ConversaItem
  /** Da mais antiga para a mais recente. */
  mensagens: Mensagem[]
  maisAnteriores: boolean
  paginas: number
}

export type MessagesPageData = {
  conversas: ConversaItem[]
  /** Há mais conversas do que as mostradas. */
  limitada: boolean
  /** Falso quando o titular só pode ler (coletivo sem "enviar mensagens"). */
  podeEnviar: boolean
  aberta: ConversaAberta | null
}

export type NewMessageData = {
  destinatario: Lado
  /** Quem pode enviar: atuações do titular e coletivos em que ele lê e envia mensagens (nunca o próprio destinatário). */
  remetentes: Lado[]
}

const KINDS = ['profile', 'collective'] as const

const optionalId = (row: Row, key: string) => {
  const value = row[key]
  if (value === null || value === undefined) return null
  if (typeof value !== 'string' || !value) throw invalid()
  return value
}

/** `{ kind, id, name }` produzido por `private.message_identity_label`. */
export function mapLado(value: unknown): Lado {
  if (!isRow(value)) throw invalid()
  return { kind: oneOf(text(value, 'kind'), KINDS), id: optionalId(value, 'id'), nome: text(value, 'name') }
}

/** Mensagem de texto livre: pode conter qualquer caractere, mas nunca ser vazia. */
const body = (row: Row, key: string) => {
  const value = row[key]
  if (typeof value !== 'string' || !value) throw invalid()
  return value
}

const unreadCount = (row: Row) => {
  const value = row.unread_count
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) throw invalid()
  return value
}

const flag = (row: Row, key: string) => {
  const value = row[key]
  if (typeof value !== 'boolean') throw invalid()
  return value
}

export function mapConversations(rows: unknown): Conversa[] {
  if (!Array.isArray(rows)) throw invalid()
  return rows.map((row: unknown) => {
    if (!isRow(row)) throw invalid()
    const updated = text(row, 'updated_at')
    return {
      id: text(row, 'id'),
      atualizadaEm: instant(updated),
      cursor: updated,
      lados: [mapLado(row.side_a), mapLado(row.side_b)],
      bloqueada: flag(row, 'blocked'),
      arquivada: flag(row, 'archived'),
      naoLidas: unreadCount(row),
    }
  })
}

function mapSender(row: Row): Lado {
  return { kind: oneOf(text(row, 'sender_kind'), KINDS), id: optionalId(row, 'sender_id'), nome: text(row, 'sender_name') }
}

export function mapMessages(rows: unknown): Mensagem[] {
  if (!Array.isArray(rows)) throw invalid()
  return rows.map((row: unknown) => {
    if (!isRow(row)) throw invalid()
    const created = text(row, 'created_at')
    return { id: text(row, 'id'), texto: body(row, 'body'), criadaEm: instant(created), cursor: created, autor: mapSender(row) }
  })
}

export function mapConversationDetails(rows: unknown): Map<string, DetalheConversa> {
  if (!Array.isArray(rows)) throw invalid()
  const details = new Map<string, DetalheConversa>()
  for (const row of rows as unknown[]) {
    if (!isRow(row)) throw invalid()
    const last = row.last_message
    if (last !== null && !isRow(last)) throw invalid()
    if (!Array.isArray(row.blocked_by)) throw invalid()
    details.set(text(row, 'conversation_id'), {
      ultima: last ? { texto: body(last, 'body'), criadaEm: instant(text(last, 'created_at')), autor: mapSender(last) } : null,
      bloqueadaPor: row.blocked_by.map(mapLado),
    })
  }
  return details
}

/** Chaves (`profile:<id>`) das pontas do titular; pontas sem id (excluídas) nunca são dele. */
export type Identity = (lado: Lado) => boolean

/** Identidade de quem lê: cada atuação do titular (conta) ou o próprio coletivo (área do coletivo). */
export const identityOf = (parties: Party[]): Identity => {
  const keys = new Set(parties.map(partyKey))
  return (lado) => lado.id !== null && keys.has(`${lado.kind}:${lado.id}`)
}

const other = (lados: [Lado, Lado], mine: Lado) => (lados[0] === mine ? lados[1] : lados[0])

/** Conversa vista por quem lê: título, quem pode enviar, estado do bloqueio e prévia da última mensagem. */
export function toConversaItem(
  conversa: Conversa,
  detalhe: DetalheConversa | undefined,
  me: Identity,
  /** `canSend`: pontas do titular por onde ele pode enviar (padrão: todas). `adoptDeleted`: conversa legível sem ponta reconhecida é da atuação excluída do titular (só leitura). */
  options: { canSend?: Identity; adoptDeleted?: boolean } = {},
): ConversaItem {
  const identified = conversa.lados.filter(me)
  const meus = identified.length === 0 && options.adoptDeleted ? conversa.lados.filter((lado) => lado.id === null) : identified
  const titulo = meus.length === 1 ? other(conversa.lados, meus[0]).nome : meus.length > 1 ? `${conversa.lados[0].nome} ↔ ${conversa.lados[1].nome}` : conversa.lados[0].nome
  const ultima = detalhe?.ultima ?? null
  const blocker = (detalhe?.bloqueadaPor ?? []).find(me)
  return {
    id: conversa.id,
    titulo,
    atualizadaEm: conversa.atualizadaEm,
    bloqueada: conversa.bloqueada,
    bloqueadaPorMim: blocker !== undefined,
    bloqueadaComo: blocker ?? null,
    arquivada: conversa.arquivada,
    naoLidas: conversa.naoLidas,
    remetentes: meus.filter((lado) => options.canSend?.(lado) ?? true).map((de) => ({ de, para: other(conversa.lados, de) })),
    meus,
    ultima: ultima ? { ...ultima, minha: me(ultima.autor) } : null,
  }
}
