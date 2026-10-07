import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import {
  CHAT_STORAGE_KEY,
  closeWindow,
  emptyDock,
  expandWindow,
  minimizeWindow,
  nameWindow,
  openWindow,
  parseDock,
  serializeDock,
  type ChatDockState,
} from '../../lib/chat'

export type ChatDockApi = {
  state: ChatDockState
  /** Abre (ou traz de volta) a janela do interlocutor; `opener` é o controle que a abriu e recebe o foco de volta no Esc. */
  open: (para: string, opener?: HTMLElement | null) => void
  /** Expande uma janela minimizada (pelo clique na barra). */
  expand: (para: string) => void
  /** Minimiza; `focus: 'opener'` (Esc) devolve o foco ao controle que abriu a janela (ou, se ele sumiu, à barra) e `'bar'` (clique) o leva à barra. */
  minimize: (para: string, options?: { focus?: 'opener' | 'bar' }) => void
  close: (para: string) => void
  rename: (para: string, nome: string) => void
  /** Esquece todas as janelas (visitante, ou o titular saiu da conta). */
  reset: () => void
  /** A barra de uma janela minimizada se registra para receber o foco quando não há controle de origem. */
  registerBar: (para: string, element: HTMLElement | null) => void
}

const ChatDockContext = createContext<ChatDockApi | null>(null)

/** Sem o provedor (testes de página isolados) a ação "Enviar mensagem" volta a ser um link comum para a tela completa. */
export const useChatDock = () => useContext(ChatDockContext)

/** Remove as janelas guardadas na aba (ao sair da conta). Nunca lança. */
export function clearChatStorage() {
  try {
    window.sessionStorage.removeItem(CHAT_STORAGE_KEY)
  } catch {
    // Armazenamento bloqueado: nada a limpar.
  }
}

/**
 * Estado das janelas do chat, no nível do documento: sobrevive à navegação entre páginas e entre layouts (público e painel)
 * e, na mesma aba, a recarregamentos (sessionStorage, só o interlocutor e se está minimizada; nunca mensagens ou rascunhos).
 */
export function ChatDockProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<ChatDockState>(emptyDock)
  const [hydrated, setHydrated] = useState(false)
  const openers = useRef(new Map<string, HTMLElement>())
  const bars = useRef(new Map<string, HTMLElement>())
  const pendingFocus = useRef<{ para: string; target: 'opener' | 'bar' } | null>(null)

  // O servidor e a primeira renderização do navegador não têm janelas (sem divergência de hidratação); o que foi guardado entra depois.
  useEffect(() => {
    let saved = emptyDock
    try {
      saved = parseDock(window.sessionStorage.getItem(CHAT_STORAGE_KEY))
    } catch {
      // Armazenamento indisponível (janela privada, bloqueio): segue sem restaurar.
    }
    setState((current) => (current.windows.length === 0 ? saved : current))
    setHydrated(true)
  }, [])

  useEffect(() => {
    if (!hydrated) return
    try {
      if (state.windows.length === 0) window.sessionStorage.removeItem(CHAT_STORAGE_KEY)
      else window.sessionStorage.setItem(CHAT_STORAGE_KEY, serializeDock(state))
    } catch {
      // Sem armazenamento a janela só não sobrevive ao recarregamento.
    }
  }, [state, hydrated])

  // Depois de minimizar com Esc: o foco volta a quem abriu a janela; se esse controle saiu da página, à barra minimizada.
  useEffect(() => {
    const pending = pendingFocus.current
    if (!pending) return
    pendingFocus.current = null
    const opener = pending.target === 'opener' ? openers.current.get(pending.para) : undefined
    const target = opener?.isConnected ? opener : bars.current.get(pending.para)
    target?.focus()
  }, [state])

  const open = useCallback((para: string, opener?: HTMLElement | null) => {
    if (opener) openers.current.set(para, opener)
    setState((current) => openWindow(current, para))
  }, [])
  const expand = useCallback((para: string) => {
    // Aberta pela barra: é a barra que recebe o foco de volta, não o controle da página de antes.
    openers.current.delete(para)
    setState((current) => expandWindow(current, para))
  }, [])
  const minimize = useCallback((para: string, options: { focus?: 'opener' | 'bar' } = {}) => {
    if (options.focus) pendingFocus.current = { para, target: options.focus }
    setState((current) => minimizeWindow(current, para))
  }, [])
  const close = useCallback((para: string) => {
    openers.current.delete(para)
    setState((current) => closeWindow(current, para))
  }, [])
  const rename = useCallback((para: string, nome: string) => setState((current) => nameWindow(current, para, nome)), [])
  const reset = useCallback(() => setState((current) => (current.windows.length === 0 ? current : emptyDock)), [])
  const registerBar = useCallback((para: string, element: HTMLElement | null) => {
    if (element) bars.current.set(para, element)
    else bars.current.delete(para)
  }, [])

  const api = useMemo<ChatDockApi>(
    () => ({ state, open, expand, minimize, close, rename, reset, registerBar }),
    [state, open, expand, minimize, close, rename, reset, registerBar],
  )
  return <ChatDockContext.Provider value={api}>{children}</ChatDockContext.Provider>
}
