import { createContext, useCallback, useContext, useState, type ReactNode } from 'react'

type Toast = { id: number; text: string; kind: 'ok' | 'info' | 'warn' }
type ToastState = { toast: (text: string, kind?: Toast['kind']) => void }

const Ctx = createContext<ToastState | null>(null)

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([])

  const toast = useCallback((text: string, kind: Toast['kind'] = 'ok') => {
    const id = Date.now() + Math.random()
    setItems((s) => [...s, { id, text, kind }])
    setTimeout(() => setItems((s) => s.filter((t) => t.id !== id)), 3600)
  }, [])

  return (
    <Ctx.Provider value={{ toast }}>
      {children}
      {/* WCAG 4.1.3 — status messages announced politely */}
      <div
        aria-live="polite"
        aria-atomic="false"
        className="fixed bottom-4 right-4 z-[100] flex w-[min(92vw,22rem)] flex-col gap-2"
      >
        {items.map((t) => (
          <div
            key={t.id}
            role="status"
            className="animate-fade-up neon-border bg-[var(--color-bg-elev)]/95 px-3 py-2 font-mono text-sm"
          >
            <span
              aria-hidden
              className="mr-2"
              style={{ color: t.kind === 'warn' ? 'var(--color-warn)' : t.kind === 'info' ? 'var(--accent-text)' : 'var(--color-ok)' }}
            >
              {t.kind === 'warn' ? '[!]' : t.kind === 'info' ? '[i]' : '[✓]'}
            </span>
            {t.text}
          </div>
        ))}
      </div>
    </Ctx.Provider>
  )
}

export function useToast() {
  const c = useContext(Ctx)
  if (!c) throw new Error('useToast must be used within ToastProvider')
  return c.toast
}
