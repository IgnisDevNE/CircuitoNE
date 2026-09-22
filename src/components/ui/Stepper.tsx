import { cx } from '../../lib/utils'

export function Stepper({ steps, current }: { steps: string[]; current: number }) {
  return (
    <ol className="mb-8 flex items-center gap-1.5 overflow-x-auto pb-1 font-mono text-xs sm:gap-2" aria-label="Progresso do cadastro">
      {steps.map((s, i) => {
        const done = i < current
        const active = i === current
        return (
          <li key={s} className="flex shrink-0 items-center gap-1.5 sm:gap-2">
            <span
              className={cx(
                'flex items-center gap-2 whitespace-nowrap border px-2.5 py-1 uppercase tracking-widest',
                active
                  ? 'border-[var(--accent)] text-[var(--foreground)]'
                  : done
                    ? 'border-[var(--color-ok)] text-[var(--color-ok)]'
                    : 'border-[var(--color-line)] text-[var(--color-muted)]',
              )}
              aria-current={active ? 'step' : undefined}
            >
              <span aria-hidden>{done ? '[✓]' : `[${i + 1}]`}</span>
              <span className={cx(!active && 'hidden sm:inline')}>{s}</span>
              {active && <span className="sr-only">(etapa atual)</span>}
            </span>
            {i < steps.length - 1 && <span aria-hidden className="text-[var(--color-muted)]">──</span>}
          </li>
        )
      })}
    </ol>
  )
}
