import { useId, useRef, type ReactNode } from 'react'
import { cx } from '../../lib/utils'

export interface TabDef {
  id: string
  label: string
  content: ReactNode
}

/** Accessible tablist (WCAG: roving arrow-key focus, aria-selected). */
export function Tabs({ tabs, active, onChange }: { tabs: TabDef[]; active: string; onChange: (id: string) => void }) {
  const base = useId()
  const refs = useRef<Record<string, HTMLButtonElement | null>>({})

  const onKey = (e: React.KeyboardEvent, idx: number) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft' && e.key !== 'Home' && e.key !== 'End') return
    e.preventDefault()
    let next = idx
    if (e.key === 'ArrowRight') next = (idx + 1) % tabs.length
    if (e.key === 'ArrowLeft') next = (idx - 1 + tabs.length) % tabs.length
    if (e.key === 'Home') next = 0
    if (e.key === 'End') next = tabs.length - 1
    const t = tabs[next]
    onChange(t.id)
    refs.current[t.id]?.focus()
  }

  const activeTab = tabs.find((t) => t.id === active) ?? tabs[0]

  return (
    <div>
      <div role="tablist" aria-label="Seções" className="flex flex-wrap gap-1 border-b border-[var(--color-line)]">
        {tabs.map((t, i) => {
          const sel = t.id === active
          return (
            <button
              key={t.id}
              ref={(el) => {
                refs.current[t.id] = el
              }}
              role="tab"
              id={`${base}-tab-${t.id}`}
              aria-selected={sel}
              aria-controls={`${base}-panel-${t.id}`}
              tabIndex={sel ? 0 : -1}
              onClick={() => onChange(t.id)}
              onKeyDown={(e) => onKey(e, i)}
              className={cx(
                'relative -mb-px border-b-2 px-4 py-2 font-mono text-xs uppercase tracking-widest transition-colors',
                sel
                  ? 'border-[var(--accent)] text-[var(--foreground)]'
                  : 'border-transparent text-[var(--color-muted)] hover:text-[var(--foreground)]',
              )}
            >
              {sel && <span aria-hidden className="text-[var(--accent-text)]">▸ </span>}
              {t.label}
            </button>
          )
        })}
      </div>
      <div
        role="tabpanel"
        id={`${base}-panel-${activeTab.id}`}
        aria-labelledby={`${base}-tab-${activeTab.id}`}
        tabIndex={0}
        className="pt-5 outline-none"
      >
        {activeTab.content}
      </div>
    </div>
  )
}
