/** Constantes e formatos de mensagens compartilhados entre servidor e telas (sem dependências de servidor). */

export const MAX_MESSAGE_LENGTH = 2000
/** Texto de sucesso do envio: a tela limpa o campo quando o recebe (só existe depois de o RPC responder). */
export const MESSAGE_SENT = 'Mensagem enviada.'
/** Intervalo da atualização automática enquanto a aba está visível (não há Realtime: as tabelas são privadas). */
export const REFRESH_INTERVAL_MS = 15_000
/** Tamanho máximo do formulário de mensagens: 2.000 emojis codificados em URL ocupam cerca de 24 KB. */
export const MESSAGE_FORM_BYTES = 32 * 1024

export type PartyKind = 'profile' | 'collective'
export type Party = { kind: PartyKind; id: string }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** `profile:<uuid>` ou `collective:<uuid>`, o formato usado em URLs e formulários. */
export const partyKey = (party: Party) => `${party.kind}:${party.id}`

export function parseParty(value: string | null | undefined): Party | null {
  const [kind, id, ...rest] = (value ?? '').split(':')
  if (rest.length || (kind !== 'profile' && kind !== 'collective') || !id || !UUID.test(id)) return null
  return { kind, id }
}

/** Remetente e destinatário num só valor (`<remetente>><destinatário>`), para o seletor "enviar como". */
export const routeKey = (from: Party, to: Party) => `${partyKey(from)}>${partyKey(to)}`

export function parseRoute(value: string | null | undefined): { from: Party; to: Party } | null {
  const [from, to, ...rest] = (value ?? '').split('>')
  const a = parseParty(from)
  const b = parseParty(to)
  return rest.length || !a || !b ? null : { from: a, to: b }
}

/** Quebras de linha do navegador chegam como CRLF; o banco conta caracteres, não unidades UTF-16. */
export const normalizeText = (value: string) => value.replace(/\r\n/g, '\n').trim()
export const textLength = (value: string) => [...value].length
