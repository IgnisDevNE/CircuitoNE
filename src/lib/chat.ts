/**
 * Chat flutuante (ChatDock): contratos da API JSON (`/api/chat/...`) e estado das janelas.
 * Sem dependências de servidor nem de React: serve ao servidor, à tela e aos testes.
 */
import type { Lado, Mensagem } from '../server/mappers/messages'
import { parseParty } from './messages'

export const CHAT_API = '/api/chat'
/** Janelas abertas ao mesmo tempo; abrir mais uma fecha a mais antiga. */
export const MAX_CHAT_WINDOWS = 3
/** Onde as janelas abertas sobrevivem a recarregamentos da aba (apenas o interlocutor e se está minimizada). */
export const CHAT_STORAGE_KEY = 'circuitone:chat-dock'

/** Uma conversa já existente entre o interlocutor e uma das minhas pontas (atuação ou coletivo). */
export type ChatConversa = { id: string; de: Lado; naoLidas: number; bloqueada: boolean; arquivada: boolean }

/** Página mais recente (ou anterior a um cursor) de uma conversa, da mais antiga para a mais recente. */
export type ChatThread = { mensagens: Mensagem[]; maisAnteriores: boolean; bloqueada: boolean }

export type ChatOpen = {
  destinatario: Lado
  /** Quem pode enviar para o interlocutor: minhas atuações e coletivos com "ler" e "enviar mensagens". */
  remetentes: Lado[]
  /** Da mais recente para a mais antiga. */
  conversas: ChatConversa[]
  /** Histórico da conversa mais recente (a que a janela mostra de início); nulo se ainda não há conversa. */
  inicial: (ChatThread & { conversationId: string }) | null
}

export type ChatSent = { ok: true; message: string; conversation_id: string }
export type ChatFailure = { error: string }

/** Mensagens novas entram no fim; as já carregadas (inclusive as mais antigas) ficam, sem duplicar. */
export function mergeMessages(existing: Mensagem[], incoming: Mensagem[]): Mensagem[] {
  const byId = new Map<string, Mensagem>()
  for (const message of existing) byId.set(message.id, message)
  for (const message of incoming) byId.set(message.id, message)
  // `cursor` guarda o instante com os microssegundos do banco, todos no mesmo formato: a ordem do texto é a ordem do tempo.
  return [...byId.values()].sort((a, b) => (a.cursor < b.cursor ? -1 : a.cursor > b.cursor ? 1 : a.id < b.id ? -1 : 1))
}

// ---- Estado das janelas ----

export type ChatWindowState = {
  /** `profile:<id>` ou `collective:<id>` do interlocutor: identifica a janela. */
  para: string
  nome: string | null
  minimized: boolean
  /** Sobe a cada pedido do usuário para abrir/expandir; o campo de mensagem só recebe o foco quando muda (nunca ao restaurar). */
  focusNonce: number
}

export type ChatDockState = { windows: ChatWindowState[] }

export const emptyDock: ChatDockState = { windows: [] }

/** Abre (ou traz de volta) a janela do interlocutor expandida; as demais ficam minimizadas, e passando do limite a mais antiga sai. */
export function openWindow(state: ChatDockState, para: string, nome: string | null = null): ChatDockState {
  const current = state.windows.find((window) => window.para === para)
  const others = state.windows.filter((window) => window.para !== para).map((window) => ({ ...window, minimized: true }))
  const opened: ChatWindowState = {
    para,
    nome: nome ?? current?.nome ?? null,
    minimized: false,
    focusNonce: (current?.focusNonce ?? 0) + 1,
  }
  // Mantém a ordem em que foram abertas: a janela já existente fica no lugar.
  const windows = current
    ? state.windows.map((window) => (window.para === para ? opened : { ...window, minimized: true }))
    : [...others, opened]
  return { windows: windows.slice(-MAX_CHAT_WINDOWS) }
}

export const expandWindow = (state: ChatDockState, para: string): ChatDockState =>
  state.windows.some((window) => window.para === para) ? openWindow(state, para) : state

export const minimizeWindow = (state: ChatDockState, para: string): ChatDockState => ({
  windows: state.windows.map((window) => (window.para === para ? { ...window, minimized: true } : window)),
})

export const closeWindow = (state: ChatDockState, para: string): ChatDockState => ({
  windows: state.windows.filter((window) => window.para !== para),
})

export const nameWindow = (state: ChatDockState, para: string, nome: string): ChatDockState =>
  state.windows.some((window) => window.para === para && window.nome !== nome)
    ? { windows: state.windows.map((window) => (window.para === para ? { ...window, nome } : window)) }
    : state

/** Só o necessário para reabrir: nada de mensagens ou rascunhos no armazenamento do navegador. */
export const serializeDock = (state: ChatDockState): string =>
  JSON.stringify(state.windows.map(({ para, nome, minimized }) => ({ para, nome, minimized })))

/** Lê o que foi guardado; qualquer formato inesperado (ou valor adulterado) vira "nenhuma janela". */
export function parseDock(raw: string | null | undefined): ChatDockState {
  try {
    const parsed: unknown = JSON.parse(raw ?? '[]')
    if (!Array.isArray(parsed)) return emptyDock
    const seen = new Set<string>()
    const windows: ChatWindowState[] = []
    for (const item of parsed) {
      if (typeof item !== 'object' || item === null) continue
      const { para, nome, minimized } = item as Record<string, unknown>
      const party = typeof para === 'string' ? parseParty(para) : null
      if (!party || seen.has(para as string)) continue
      seen.add(para as string)
      windows.push({
        para: para as string,
        nome: typeof nome === 'string' && nome.length <= 200 ? nome : null,
        minimized: minimized === true,
        focusNonce: 0,
      })
    }
    // No máximo uma janela expandida e no máximo MAX_CHAT_WINDOWS no total.
    let expanded = false
    for (let i = windows.length - 1; i >= 0; i--) {
      if (windows[i].minimized) continue
      if (expanded) windows[i].minimized = true
      expanded = true
    }
    return { windows: windows.slice(-MAX_CHAT_WINDOWS) }
  } catch {
    return emptyDock
  }
}
