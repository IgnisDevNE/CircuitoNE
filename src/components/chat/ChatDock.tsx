import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'
import { Link, useRevalidator, useRouteLoaderData } from 'react-router'
import { fetchChatOpen, fetchChatThread, markChatRead, sendChatMessage } from '../../lib/chat-client'
import { mergeMessages, type ChatConversa, type ChatOpen, type ChatThread, type ChatWindowState } from '../../lib/chat'
import { MAX_MESSAGE_LENGTH, parseParty, partyKey, REFRESH_INTERVAL_MS, routeKey } from '../../lib/messages'
import { cx } from '../../lib/utils'
import type { Lado } from '../../server/mappers/messages'
import { Bubble } from '../ui/Chat'
import { Button } from '../ui/primitives'
import { useChatDock, type ChatDockApi } from './ChatDockProvider'

const fieldClass =
  'w-full bg-[var(--color-bg-elev)] border border-[var(--color-control)] px-3 py-2 font-mono text-sm outline-none focus:border-[var(--accent)]'
const iconButton =
  'inline-flex min-h-8 min-w-8 shrink-0 items-center justify-center px-1 font-mono text-sm text-[var(--color-muted)] hover:text-[var(--foreground)]'

type Load = { status: 'idle' | 'loading' | 'ready' | 'error'; error?: string; unauthorized?: boolean }

const sideOf = (lado: Lado) => partyKey({ kind: lado.kind, id: lado.id ?? '' })

/** Verdadeiro enquanto a aba está visível: a atualização periódica e o "marcar como lida" só valem com a janela à vista. */
function useVisible() {
  const [visible, setVisible] = useState(() => typeof document === 'undefined' || document.visibilityState === 'visible')
  useEffect(() => {
    const update = () => setVisible(document.visibilityState === 'visible')
    document.addEventListener('visibilitychange', update)
    return () => document.removeEventListener('visibilitychange', update)
  }, [])
  return visible
}

/** Dados e ações de uma janela: abertura, atualização periódica, histórico anterior, envio e leitura. Sem navegação. */
function useChatWindow(win: ChatWindowState, expanded: boolean, onName: (nome: string) => void) {
  const revalidator = useRevalidator()
  const revalidate = useRef(revalidator.revalidate)
  revalidate.current = revalidator.revalidate
  const visible = useVisible()

  const [load, setLoad] = useState<Load>({ status: 'idle' })
  const [open, setOpen] = useState<ChatOpen | null>(null)
  const [conversas, setConversas] = useState<ChatConversa[]>([])
  const [threads, setThreads] = useState<Record<string, ChatThread>>({})
  const [via, setVia] = useState('')
  const [pendingRead, setPendingRead] = useState<ReadonlySet<string>>(new Set())
  const [olderBusy, setOlderBusy] = useState(false)
  const [text, setText] = useState('')
  const [requestId, setRequestId] = useState('')
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState<string | null>(null)

  const threadsRef = useRef(threads)
  threadsRef.current = threads
  const openRef = useRef(open)
  openRef.current = open
  const sendingRef = useRef(false)
  const started = useRef(false)

  // A chave de idempotência nasce no navegador e muda a cada texto novo e a cada envio concluído: reenviar o mesmo texto
  // (clique duplo, nova tentativa depois de uma queda) repete a chave e o banco devolve a mesma mensagem.
  useEffect(() => setRequestId(crypto.randomUUID()), [])

  const current = conversas.find((conversa) => partyKey({ kind: conversa.de.kind, id: conversa.de.id ?? '' }) === via)
  const thread = current ? threads[current.id] : undefined

  const fail = useCallback((status: number, error: string) => {
    if (status === 401) setLoad({ status: 'error', error, unauthorized: true })
  }, [])

  const refresh = useCallback(
    async (id: string) => {
      const result = await fetchChatThread(id)
      if (!result.ok) {
        fail(result.status, result.error)
        return result
      }
      const old = threadsRef.current[id]
      const mine = new Set((openRef.current?.remetentes ?? []).map(sideOf))
      // Mensagens de outra pessoa que chegaram depois da primeira leitura: marcar como lida e atualizar o menu.
      const arrived = old ? result.data.mensagens.filter((m) => !old.mensagens.some((k) => k.id === m.id) && !mine.has(sideOf(m.autor))) : []
      setThreads((prev) => ({
        ...prev,
        [id]: {
          mensagens: prev[id] ? mergeMessages(prev[id].mensagens, result.data.mensagens) : result.data.mensagens,
          maisAnteriores: prev[id] ? prev[id].maisAnteriores : result.data.maisAnteriores,
          bloqueada: result.data.bloqueada,
        },
      }))
      if (arrived.length > 0) {
        setPendingRead((prev) => new Set(prev).add(id))
        void revalidate.current()
      }
      return result
    },
    [fail],
  )

  const loadOpen = useCallback(async () => {
    setLoad({ status: 'loading' })
    const result = await fetchChatOpen(win.para)
    if (!result.ok) {
      setLoad({ status: 'error', error: result.error, unauthorized: result.status === 401 })
      return
    }
    const data = result.data
    setOpen(data)
    setConversas(data.conversas)
    setThreads(
      data.inicial
        ? { [data.inicial.conversationId]: { mensagens: data.inicial.mensagens, maisAnteriores: data.inicial.maisAnteriores, bloqueada: data.inicial.bloqueada } }
        : {},
    )
    setVia((prev) => prev || (data.conversas[0] ? sideOf(data.conversas[0].de) : data.remetentes[0] ? sideOf(data.remetentes[0]) : ''))
    setPendingRead(new Set(data.conversas.filter((conversa) => conversa.naoLidas > 0).map((conversa) => conversa.id)))
    onName(data.destinatario.nome)
    setLoad({ status: 'ready' })
  }, [win.para, onName])

  // Só carrega quando a janela é aberta pela primeira vez: janelas restauradas minimizadas não consultam nada.
  useEffect(() => {
    if (!expanded || started.current) return
    started.current = true
    void loadOpen()
  }, [expanded, loadOpen])

  const retry = useCallback(() => {
    started.current = true
    void loadOpen()
  }, [loadOpen])

  // Troca de "enviar como" para uma conversa que ainda não foi lida nesta janela.
  const currentId = current?.id
  const hasThread = thread !== undefined
  useEffect(() => {
    if (expanded && currentId && !hasThread && !sendingRef.current) void refresh(currentId)
  }, [expanded, currentId, hasThread, refresh])

  // Atualização a cada ~15 s, só com a janela expandida e a aba visível (e já ao voltar para a aba).
  useEffect(() => {
    if (!expanded || !visible || !currentId || load.status !== 'ready') return
    const timer = setInterval(() => void refresh(currentId), REFRESH_INTERVAL_MS)
    return () => clearInterval(timer)
  }, [expanded, visible, currentId, load.status, refresh])
  const wasVisible = useRef(visible)
  useEffect(() => {
    if (visible && !wasVisible.current && expanded && currentId && load.status === 'ready') void refresh(currentId)
    wasVisible.current = visible
  }, [visible, expanded, currentId, load.status, refresh])

  // Marca como lida com a janela aberta e a aba visível; depois o menu e o dashboard recarregam as contagens.
  const lastId = thread?.mensagens[thread.mensagens.length - 1]?.id
  useEffect(() => {
    if (!expanded || !visible || !currentId || !lastId || !pendingRead.has(currentId)) return
    setPendingRead((prev) => {
      const next = new Set(prev)
      next.delete(currentId)
      return next
    })
    void markChatRead(currentId, lastId).then((result) => {
      if (result.ok) {
        setConversas((prev) => prev.map((conversa) => (conversa.id === currentId ? { ...conversa, naoLidas: 0 } : conversa)))
        void revalidate.current()
      } else fail(result.status, result.error)
    })
  }, [expanded, visible, currentId, lastId, pendingRead, fail])

  const loadOlder = useCallback(async () => {
    const first = currentId ? threadsRef.current[currentId]?.mensagens[0] : undefined
    if (!currentId || !first) return
    setOlderBusy(true)
    const result = await fetchChatThread(currentId, { time: first.cursor, id: first.id })
    setOlderBusy(false)
    if (!result.ok) {
      setSendError(result.error)
      return
    }
    setThreads((prev) =>
      prev[currentId]
        ? { ...prev, [currentId]: { ...prev[currentId], mensagens: mergeMessages(prev[currentId].mensagens, result.data.mensagens), maisAnteriores: result.data.maisAnteriores } }
        : prev,
    )
  }, [currentId])

  const changeText = (value: string) => {
    setText(value)
    setRequestId(crypto.randomUUID())
  }

  const send = useCallback(async () => {
    const target = parseParty(win.para)
    const sender = open?.remetentes.find((lado) => sideOf(lado) === via)
    if (sendingRef.current || !text.trim() || !target || !sender || load.status !== 'ready') return
    sendingRef.current = true
    setSending(true)
    setSendError(null)
    const result = await sendChatMessage({
      via: routeKey({ kind: sender.kind, id: sender.id ?? '' }, target),
      body: text,
      requestId,
    })
    if (result.ok) {
      const id = result.data.conversation_id
      setText('')
      setRequestId(crypto.randomUUID())
      setConversas((prev) => (prev.some((conversa) => conversa.id === id) ? prev : [{ id, de: sender, naoLidas: 0, bloqueada: false, arquivada: false }, ...prev]))
      await refresh(id)
      // A central de mensagens e o menu passam a refletir a conversa criada ou atualizada.
      void revalidate.current()
    } else {
      setSendError(result.error)
      fail(result.status, result.error)
      // Bloqueio ou perda de permissão decididos pelo banco: relê a conversa para a janela mostrar o estado real.
      if (currentId && (result.status === 409 || result.status === 403)) void refresh(currentId)
    }
    sendingRef.current = false
    setSending(false)
  }, [win.para, open, via, text, requestId, load.status, refresh, fail, currentId])

  return { load, open, conversas, current, thread, via, setVia, text, changeText, sending, sendError, send, retry, loadOlder, olderBusy }
}

/** Rótulo curto da janela: o interlocutor (ou "Nova conversa" até a leitura terminar). */
const titleOf = (win: ChatWindowState) => win.nome ?? 'Nova conversa'

function MinimizedBar({ win, dock }: { win: ChatWindowState; dock: ChatDockApi }) {
  const title = titleOf(win)
  const ref = useCallback((element: HTMLButtonElement | null) => dock.registerBar(win.para, element), [dock, win.para])
  return (
    <div className="pointer-events-auto neon-border flex w-64 items-center bg-[var(--color-surface)] max-sm:w-full max-sm:border-x-0 max-sm:border-b-0">
      <button
        ref={ref}
        type="button"
        aria-expanded={false}
        aria-label={`Abrir conversa com ${title}`}
        onClick={() => dock.expand(win.para)}
        className="min-h-10 min-w-0 flex-1 break-words px-3 py-2 text-left font-mono text-xs uppercase tracking-[0.15em] hover:text-[var(--accent-text)]"
      >
        <span aria-hidden className="mr-2 text-[var(--accent-text)]">▸</span>
        {title}
      </button>
      <button type="button" onClick={() => dock.close(win.para)} aria-label={`Fechar conversa com ${title}`} className={iconButton}>
        <span aria-hidden>[✕]</span>
      </button>
    </div>
  )
}

function ChatWindow({ win, dock }: { win: ChatWindowState; dock: ChatDockApi }) {
  const expanded = !win.minimized
  const { rename } = dock
  const onName = useCallback((nome: string) => rename(win.para, nome), [rename, win.para])
  const chat = useChatWindow(win, expanded, onName)
  if (!expanded) return <MinimizedBar win={win} dock={dock} />
  return <ExpandedWindow win={win} dock={dock} chat={chat} />
}

function ExpandedWindow({ win, dock, chat }: { win: ChatWindowState; dock: ChatDockApi; chat: ReturnType<typeof useChatWindow> }) {
  const { load, open, current, thread, via, text, sending, sendError } = chat
  const title = titleOf(win)
  const dialogRef = useRef<HTMLElement>(null)
  const textRef = useRef<HTMLTextAreaElement>(null)
  const logRef = useRef<HTMLDivElement>(null)
  const nearBottom = useRef(true)
  const ids = useId()
  const textId = `${ids}-mensagem`
  const noteId = `${ids}-nota`
  const hintId = `${ids}-dica`

  // O foco vai para o campo de mensagem quando o usuário abre ou expande a janela (nunca ao restaurar a página).
  useEffect(() => {
    if (win.focusNonce > 0) (textRef.current ?? dialogRef.current)?.focus()
  }, [win.focusNonce])

  const mine = new Set((open?.remetentes ?? []).map(sideOf))
  const isMine = (lado: Lado) => mine.has(sideOf(lado))
  const mensagens = thread?.mensagens ?? []
  const lastMessage = mensagens[mensagens.length - 1]
  const lastIsMine = lastMessage ? isMine(lastMessage.autor) : false
  const lastId = lastMessage?.id
  useEffect(() => {
    const log = logRef.current
    if (log && lastId && (nearBottom.current || lastIsMine)) log.scrollTop = log.scrollHeight
  }, [lastId, lastIsMine, load.status])

  const blocked = thread?.bloqueada === true || current?.bloqueada === true
  const archived = current?.arquivada === true
  const noSender = load.status === 'ready' && (open?.remetentes.length ?? 0) === 0
  const readOnly = load.status === 'error' || noSender || blocked || archived
  const note = noSender
    ? `Você não tem uma atuação ou coletivo que possa enviar mensagens para ${open?.destinatario.nome ?? 'este interlocutor'}.`
    : blocked
      ? 'Conversa bloqueada: ninguém envia mensagens até o desbloqueio, que só quem bloqueou pode fazer.'
      : archived
        ? 'Conversa arquivada: um dos lados não está mais disponível. O histórico continua visível.'
        : null

  const fullHref = current ? (current.de.kind === 'collective' ? `/coletivo/${current.de.id}/mensagens/${current.id}` : `/painel/mensagens/${current.id}`) : null

  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key !== 'Escape' || event.defaultPrevented) return
    event.preventDefault()
    event.stopPropagation()
    dock.minimize(win.para, { focus: 'opener' })
  }
  const onTextKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    // Enter envia; Shift+Enter quebra a linha. Durante a composição (IME) o Enter pertence ao método de entrada.
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing && !readOnly) {
      event.preventDefault()
      void chat.send()
    }
  }

  return (
    <section
      ref={dialogRef}
      role="dialog"
      aria-modal="false"
      aria-label={`Conversa com ${title}`}
      tabIndex={-1}
      onKeyDown={onKeyDown}
      className="pointer-events-auto neon-border animate-fade-up flex h-[28rem] max-h-[80dvh] w-80 flex-col bg-[var(--color-surface)] outline-none max-sm:h-[75dvh] max-sm:w-full max-sm:border-x-0 max-sm:border-b-0"
    >
      <div className="flex shrink-0 items-center gap-1 border-b border-[var(--color-line)] pl-3 pr-1">
        <span aria-hidden className="mr-1 flex gap-1">
          <span className="h-2 w-2 rounded-full bg-[var(--accent)]" />
          <span className="h-2 w-2 rounded-full bg-[var(--color-warn)]" />
          <span className="h-2 w-2 rounded-full bg-[var(--color-ok)]" />
        </span>
        <button
          type="button"
          aria-expanded
          aria-label={`Minimizar conversa com ${title}`}
          onClick={() => dock.minimize(win.para, { focus: 'bar' })}
          className="min-h-10 min-w-0 flex-1 break-words py-2 text-left font-mono text-xs uppercase tracking-[0.15em] hover:text-[var(--accent-text)]"
        >
          {title}
        </button>
        <button type="button" onClick={() => dock.close(win.para)} aria-label={`Fechar conversa com ${title}`} className={iconButton}>
          <span aria-hidden>[✕]</span>
        </button>
      </div>

      {fullHref && (
        <p className="shrink-0 border-b border-[var(--color-line)] px-3 font-mono text-xs">
          <Link to={fullHref} className="inline-flex min-h-8 items-center text-[var(--accent-text)] underline">abrir conversa completa</Link>
        </p>
      )}

      <div className="flex min-h-0 flex-1 flex-col" aria-busy={load.status === 'loading'}>
        {load.status === 'loading' || load.status === 'idle' ? (
          <p aria-live="polite" className="p-3 font-mono text-xs text-[var(--color-muted)]">Carregando conversa…</p>
        ) : load.status === 'error' ? (
          <div className="space-y-2 p-3">
            <p role="alert" className="font-mono text-xs text-[var(--accent-text)]">[erro] {load.error}</p>
            {load.unauthorized ? (
              <Link to="/entrar" className="font-mono text-xs text-[var(--accent-text)] underline">entrar novamente</Link>
            ) : (
              <Button type="button" size="sm" variant="outline" onClick={chat.retry}>tentar de novo</Button>
            )}
          </div>
        ) : (
          <>
            {thread?.maisAnteriores && (
              <button
                type="button"
                onClick={() => void chat.loadOlder()}
                disabled={chat.olderBusy}
                className="shrink-0 self-center py-1.5 font-mono text-xs text-[var(--accent-text)] underline disabled:opacity-50"
              >
                carregar anteriores
              </button>
            )}
            <div
              ref={logRef}
              role="log"
              aria-live="polite"
              aria-relevant="additions"
              aria-label={`Mensagens com ${title}`}
              tabIndex={0}
              onScroll={(event) => {
                const log = event.currentTarget
                nearBottom.current = log.scrollHeight - log.scrollTop - log.clientHeight < 48
              }}
              className="min-h-0 flex-1 overflow-y-auto p-3 focus-visible:outline-offset-[-2px]"
            >
              {mensagens.length === 0 ? (
                <p className="font-mono text-xs text-[var(--color-muted)]">Nenhuma mensagem ainda. Escreva a primeira.</p>
              ) : (
                <ul className="space-y-3">
                  {mensagens.map((mensagem) => (
                    <Bubble key={mensagem.id} mensagem={mensagem} minha={isMine(mensagem.autor)} autor={!isMine(mensagem.autor) || mine.size > 1} reportable={false} />
                  ))}
                </ul>
              )}
            </div>
          </>
        )}
      </div>

      <form
        onSubmit={(event) => {
          event.preventDefault()
          void chat.send()
        }}
        className="shrink-0 space-y-2 border-t border-[var(--color-line)] p-3"
      >
        {load.status === 'ready' && (open?.remetentes.length ?? 0) > 1 && (
          <div>
            <label htmlFor={`${ids}-via`} className="mb-1 block font-mono text-xs text-[var(--color-muted)]">Enviar como</label>
            <select id={`${ids}-via`} value={via} onChange={(event) => chat.setVia(event.target.value)} className={fieldClass}>
              {open!.remetentes.map((lado) => (
                <option key={sideOf(lado)} value={sideOf(lado)}>{lado.nome}</option>
              ))}
            </select>
          </div>
        )}
        {load.status === 'ready' && (open?.remetentes.length ?? 0) === 1 && (
          <p className="font-mono text-xs text-[var(--color-muted)]">Enviando como {open!.remetentes[0].nome}.</p>
        )}
        {sendError && <p role="alert" className="font-mono text-xs text-[var(--accent-text)]">[erro] {sendError}</p>}
        {note && <p id={noteId} className="font-mono text-xs text-[var(--color-muted)]">{note}</p>}
        <label htmlFor={textId} className="sr-only">Mensagem para {title}</label>
        <div className="flex gap-2">
          <textarea
            id={textId}
            ref={textRef}
            value={text}
            onChange={(event) => chat.changeText(event.target.value)}
            onKeyDown={onTextKeyDown}
            readOnly={readOnly}
            maxLength={MAX_MESSAGE_LENGTH}
            rows={2}
            placeholder="digite uma mensagem…"
            aria-describedby={cx(hintId, note && noteId)}
            className={cx(fieldClass, 'min-h-12 flex-1 resize-none placeholder:text-[var(--color-muted)]')}
          />
          <Button type="submit" variant="solid" size="sm" disabled={sending || readOnly || load.status !== 'ready' || !text.trim()}>enviar</Button>
        </div>
        <p id={hintId} className="font-mono text-[0.65rem] text-[var(--color-muted)]">Enter envia · Shift+Enter nova linha · Esc minimiza</p>
      </form>
    </section>
  )
}

/** Janelas de conversa no canto inferior direito (no celular, uma folha na largura da tela). Só para quem está logado. */
export function ChatDock() {
  const dock = useChatDock()
  // A sessão vem dos loaders dos layouts (validada no servidor): páginas públicas e painel; sem nenhum deles não há chat.
  const publicSession = useRouteLoaderData('routes/layouts/public') as { signedIn?: boolean } | undefined
  const appSession = useRouteLoaderData('routes/layouts/app') as { status?: string } | undefined
  const signedIn = publicSession?.signedIn === true || appSession?.status === 'active'
  const knownGuest = publicSession !== undefined && publicSession.signedIn === false
  const reset = dock?.reset
  const count = dock?.state.windows.length ?? 0
  // Visitante conhecido (o layout público diz que não há sessão): nada de janelas, nem as restauradas da aba.
  useEffect(() => {
    if (knownGuest && count > 0) reset?.()
  }, [knownGuest, count, reset])
  const expanded = dock?.state.windows.some((window) => !window.minimized) ?? false
  const visible = signedIn && count > 0
  // Deixa o conteúdo da página fora de baixo da barra/janela ao navegar por teclado (WCAG 2.4.11): ver `index.css`.
  useEffect(() => {
    if (!visible) return
    document.documentElement.dataset.chatDock = expanded ? 'open' : 'min'
    return () => {
      delete document.documentElement.dataset.chatDock
    }
  }, [visible, expanded])

  if (!dock || !visible) return null
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex items-end justify-end gap-3 px-4 max-sm:flex-col max-sm:items-stretch max-sm:gap-0 max-sm:px-0">
      {dock.state.windows.map((win) => (
        <ChatWindow key={win.para} win={win} dock={dock} />
      ))}
    </div>
  )
}
