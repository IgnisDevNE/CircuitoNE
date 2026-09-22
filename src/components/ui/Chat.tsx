import { useEffect, useRef, useState } from 'react'
import type { Thread } from '../../data/types'
import { useStore } from '../../context/StoreContext'
import { Button } from './primitives'
import { cx } from '../../lib/utils'

function hora(iso: string) {
  const d = new Date(iso)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

export function Chat({ thread }: { thread: Thread }) {
  const { sendMessage } = useStore()
  const [text, setText] = useState('')
  const logRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight })
  }, [thread.mensagens.length])

  const enviar = (e: React.FormEvent) => {
    e.preventDefault()
    if (!text.trim()) return
    sendMessage(thread.id, text.trim())
    setText('')
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div ref={logRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto p-1" role="log" aria-label={`Conversa: ${thread.titulo}`} aria-live="polite">
        {thread.mensagens.map((m) => {
          const meu = m.autorId === 'u-demo'
          return (
            <div key={m.id} className={cx('flex flex-col', meu ? 'items-end' : 'items-start')}>
              <div className={cx('max-w-[85%] border px-3 py-2', meu ? 'border-[var(--accent)] bg-[color:color-mix(in_srgb,var(--accent)_12%,transparent)]' : 'border-[var(--color-line)] bg-[var(--color-bg-elev)]')}>
                {!meu && <p className="mb-0.5 font-mono text-[0.65rem] uppercase tracking-widest text-[var(--accent-text)]">{m.autorNome}</p>}
                <p className="text-sm">{m.texto}</p>
              </div>
              <span className="mt-0.5 font-mono text-[0.6rem] text-[var(--color-muted)]">{hora(m.timestamp)}</span>
            </div>
          )
        })}
      </div>
      <form onSubmit={enviar} className="mt-3 flex shrink-0 gap-2 border-t border-[var(--color-line)] bg-[var(--color-surface)] pt-3">
        <label htmlFor={`msg-${thread.id}`} className="sr-only">Mensagem para {thread.titulo}</label>
        <input
          id={`msg-${thread.id}`}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="digite uma mensagem…"
          className="flex-1 bg-[var(--color-bg-elev)] border border-[var(--color-line)] px-3 py-2 font-mono text-sm outline-none focus:border-[var(--accent)]"
        />
        <Button type="submit" variant="solid" size="sm">enviar</Button>
      </form>
    </div>
  )
}
