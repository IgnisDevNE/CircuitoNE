import { useEffect, useState } from 'react'
import { useStore } from '../../context/StoreContext'
import { usePageTitle } from '../../lib/usePageTitle'
import { Badge, Empty, Panel } from '../../components/ui/primitives'
import { Chat } from '../../components/ui/Chat'
import { cx } from '../../lib/utils'

export function Messages() {
  usePageTitle('Central de Mensagens')
  const { threads, markThreadRead } = useStore()
  const [activeId, setActiveId] = useState(threads[0]?.id ?? '')
  const active = threads.find((t) => t.id === activeId)

  useEffect(() => {
    if (activeId) markThreadRead(activeId)
  }, [activeId, markThreadRead])

  return (
    <div className="space-y-6">
      <h1 className="font-display text-2xl font-bold text-glow">$ central_de_mensagens</h1>

      <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
        <Panel title="conversas" className="lg:h-[70vh]">
          {threads.length === 0 ? (
            <Empty>Sem conversas.</Empty>
          ) : (
            <ul className="space-y-1">
              {threads.map((t) => (
                <li key={t.id}>
                  <button
                    onClick={() => setActiveId(t.id)}
                    aria-current={t.id === activeId ? 'true' : undefined}
                    className={cx(
                      'flex w-full items-center justify-between gap-2 border-l-2 px-3 py-2 text-left font-mono text-sm transition-colors',
                      t.id === activeId ? 'border-[var(--accent)] bg-[color:color-mix(in_srgb,var(--accent)_12%,transparent)] text-[var(--foreground)]' : 'border-transparent text-[var(--color-muted)] hover:text-[var(--foreground)]',
                    )}
                  >
                    <span className="min-w-0 truncate">{t.titulo}</span>
                    {t.naoLidas > 0 && <Badge tone="accent">{t.naoLidas}</Badge>}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title={active ? active.titulo : 'conversa'} className="flex h-[70vh] flex-col" bodyClassName="flex min-h-0 flex-1 flex-col">
          {active ? <Chat thread={active} /> : <Empty>Selecione uma conversa.</Empty>}
        </Panel>
      </div>
    </div>
  )
}
