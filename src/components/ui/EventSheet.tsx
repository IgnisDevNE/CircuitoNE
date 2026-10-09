import { useCallback, useEffect, useId, useRef, useState, type MouseEvent, type ReactNode } from 'react'
import { Link, type LinkProps } from 'react-router'
import { eventPath, fetchEventSheet } from '../../lib/event-client'
import { cx } from '../../lib/utils'
import { EventPage } from '../../pages/public/EventPage'
import type { EventPageData } from '../../server/mappers/events'
import { Button, btnClass } from './primitives'

type Load = { status: 'loading' } | { status: 'ready'; data: EventPageData } | { status: 'error'; http: number; message: string }

const NOT_FOUND = 'Evento não encontrado ou não está mais publicado.'
const FAILED = 'Não foi possível carregar o evento agora.'

/**
 * Painel lateral com a página pública do evento, sobre a tela atual (quem está no painel não perde o lugar nem precisa dos
 * botões do navegador para voltar). É um `<dialog>` nativo aberto com `showModal()`: o foco fica preso nele, o fundo fica
 * inerte, Esc fecha e o foco volta ao elemento que abriu. Monte-o só enquanto estiver aberto; `onClose` é chamado em todo
 * fechamento (botão, Esc ou clique no fundo).
 */
export function EventSheet({ id, nome, onClose }: { id: string; nome: string; onClose: () => void }) {
  const titleId = useId()
  const dialog = useRef<HTMLDialogElement>(null)
  const pressedBackdrop = useRef(false)
  const [load, setLoad] = useState<Load>({ status: 'loading' })
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    const element = dialog.current
    if (!element || element.open) return
    if (typeof element.showModal === 'function') element.showModal()
    else element.setAttribute('open', '')
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    setLoad({ status: 'loading' })
    void fetchEventSheet(id, controller.signal).then((result) => {
      if (controller.signal.aborted) return
      setLoad(result.ok ? { status: 'ready', data: result.data } : { status: 'error', http: result.status, message: result.error })
    })
    return () => controller.abort()
  }, [id, attempt])

  const close = useCallback(() => {
    const element = dialog.current
    if (element && typeof element.close === 'function' && element.open) element.close()
    else onClose()
  }, [onClose])

  // Clique no fundo: o próprio `<dialog>` (sem margem nem preenchimento) só é alvo fora do conteúdo. Pressionar dentro e soltar
  // fora (ao selecionar texto, por exemplo) não fecha.
  const onPointerDown = (event: MouseEvent<HTMLDialogElement>) => {
    pressedBackdrop.current = event.target === event.currentTarget
  }
  const onClick = (event: MouseEvent<HTMLDialogElement>) => {
    if (event.target === event.currentTarget && pressedBackdrop.current) close()
    pressedBackdrop.current = false
  }

  let body: ReactNode
  if (load.status === 'ready') {
    body = <EventPage {...load.data} compacto titleId={titleId} />
  } else if (load.status === 'error') {
    const missing = load.http === 404
    body = (
      <div role="alert" className="space-y-4">
        <h2 id={titleId} className="font-display text-2xl font-bold">{nome}</h2>
        <p className="font-mono text-sm text-[var(--color-muted)]">{missing ? NOT_FOUND : load.message || FAILED}</p>
        {!missing && <Button type="button" variant="outline" size="sm" onClick={() => setAttempt((n) => n + 1)}>tentar de novo</Button>}
      </div>
    )
  } else {
    body = <h2 id={titleId} className="font-display text-2xl font-bold">{nome}</h2>
  }

  return (
    <dialog
      ref={dialog}
      aria-labelledby={titleId}
      onClose={onClose}
      onPointerDown={onPointerDown}
      onClick={onClick}
      className="event-sheet fixed inset-y-0 right-0 left-auto m-0 h-dvh max-h-dvh w-full max-w-[40rem] overflow-y-auto border-l border-[var(--color-control)] bg-[var(--color-bg)] p-0 text-[var(--color-foreground)] backdrop:bg-black/70"
    >
      <div className="flex min-h-full flex-col">
        <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-[var(--color-line)] bg-[var(--color-bg)] px-4 py-2">
          <button
            type="button"
            onClick={close}
            aria-label="fechar"
            className="inline-flex min-h-8 min-w-8 shrink-0 cursor-pointer items-center justify-center border border-[var(--color-control)] px-2 font-mono text-sm text-[var(--color-foreground)] hover:border-[var(--accent-text)]"
          >
            <span aria-hidden>[✕]</span>
          </button>
          <Link to={eventPath(id)} className={cx(btnClass('ghost', 'sm'), 'normal-case')}>
            abrir página do evento ↗
          </Link>
        </div>
        <div className="flex-1 p-4 sm:p-6" aria-busy={load.status === 'loading'}>
          <div role="status" className="font-mono text-sm text-[var(--color-muted)]">
            {load.status === 'loading' && 'carregando evento…'}
          </div>
          <div className="mt-4">{body}</div>
        </div>
      </div>
    </dialog>
  )
}

type EventSheetLinkProps = Omit<LinkProps, 'to' | 'onClick'> & {
  /** Id do evento: o destino do link é a página pública `/eventos/:id`. */
  eventId: string
  /** Nome do evento: nomeia o painel (acessibilidade) enquanto o conteúdo carrega. */
  nome: string
  children: ReactNode
}

const plainPrimaryClick = (event: MouseEvent<HTMLAnchorElement>) =>
  event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey && !event.defaultPrevented

/**
 * Link para a página pública de um evento que, num clique comum, abre o evento num painel lateral em vez de navegar.
 * Continua um `<Link>` de verdade: sem JavaScript, com Ctrl/Cmd/Shift, botão do meio ou "abrir em nova aba", vai para a página.
 */
export function EventSheetLink({ eventId, nome, children, ...rest }: EventSheetLinkProps) {
  const link = useRef<HTMLAnchorElement>(null)
  const [open, setOpen] = useState(false)
  const close = useCallback(() => {
    setOpen(false)
    // Ao fechar um diálogo modal o navegador já devolve o foco; repetir garante isso também onde o `<dialog>` é simulado.
    link.current?.focus()
  }, [])
  return (
    <>
      <Link
        {...rest}
        ref={link}
        to={eventPath(eventId)}
        aria-haspopup="dialog"
        onClick={(event) => {
          if (!plainPrimaryClick(event) || rest.target === '_blank') return
          event.preventDefault()
          setOpen(true)
        }}
      >
        {children}
      </Link>
      {open && <EventSheet id={eventId} nome={nome} onClose={close} />}
    </>
  )
}
