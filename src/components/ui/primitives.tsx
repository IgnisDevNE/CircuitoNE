import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { cx } from '../../lib/utils'
import { Link } from '../../router'

/** Terminal window panel with a titled chrome bar. */
export function Panel({
  title,
  children,
  className,
  bodyClassName,
  neon = true,
  actions,
}: {
  title?: string
  children: ReactNode
  className?: string
  bodyClassName?: string
  neon?: boolean
  actions?: ReactNode
}) {
  return (
    <section
      className={cx(
        'relative bg-[var(--color-surface)]/70 backdrop-blur-sm',
        neon ? 'neon-border' : 'border border-[var(--color-line)]',
        className,
      )}
    >
      {title && (
        <header className="flex items-center justify-between gap-2 border-b border-[var(--color-line)] px-3 py-2">
          <div className="flex items-center gap-2">
            <span aria-hidden className="flex gap-1">
              <span className="h-2 w-2 rounded-full bg-[var(--accent)]" />
              <span className="h-2 w-2 rounded-full bg-[var(--color-warn)]" />
              <span className="h-2 w-2 rounded-full bg-[var(--color-ok)]" />
            </span>
            <h2 className="font-mono text-xs uppercase tracking-[0.2em] text-[var(--color-muted)]">{title}</h2>
          </div>
          {actions}
        </header>
      )}
      <div className={cx('p-4', bodyClassName)}>{children}</div>
    </section>
  )
}

type BtnBase = {
  children: ReactNode
  variant?: 'solid' | 'outline' | 'ghost' | 'danger'
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

function btnClass(variant: BtnBase['variant'] = 'outline', size: BtnBase['size'] = 'md', className?: string) {
  const sizes = { sm: 'px-3 py-1.5 text-xs', md: 'px-4 py-2 text-sm', lg: 'px-5 py-2.5 text-base' }
  const base =
    'inline-flex items-center justify-center gap-2 font-mono uppercase tracking-wider transition-all duration-150 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer select-none'
  const variants = {
    solid: 'bg-[var(--accent)] text-black font-bold hover:brightness-110 border border-[var(--accent)]',
    outline:
      'border border-[color:color-mix(in_srgb,var(--accent)_60%,transparent)] text-[var(--foreground)] hover:bg-[color:color-mix(in_srgb,var(--accent)_15%,transparent)] hover:border-[var(--accent)]',
    ghost: 'text-[var(--color-muted)] hover:text-[var(--foreground)] hover:bg-white/5',
    danger: 'border border-[var(--color-accent)] text-[var(--color-accent-text)] hover:bg-[var(--color-accent)]/15',
  }
  return cx(base, sizes[size], variants[variant], className)
}

export function Button({ children, variant, size, className, ...rest }: BtnBase & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button className={btnClass(variant, size, className)} {...rest}>
      {children}
    </button>
  )
}

export function LinkButton({ to, children, variant, size, className }: BtnBase & { to: string }) {
  return (
    <Link to={to} className={btnClass(variant, size, className)}>
      {children}
    </Link>
  )
}

export function Badge({ children, tone = 'neutral', className }: { children: ReactNode; tone?: 'neutral' | 'accent' | 'ok' | 'warn'; className?: string }) {
  const tones = {
    neutral: 'border-[var(--color-line)] text-[var(--color-muted)]',
    accent: 'border-[var(--accent)] text-[var(--accent-text)]',
    ok: 'border-[var(--color-ok)] text-[var(--color-ok)]',
    warn: 'border-[var(--color-warn)] text-[var(--color-warn)]',
  }
  return (
    <span className={cx('inline-flex items-center gap-1 border px-2 py-0.5 font-mono text-[0.65rem] uppercase tracking-widest', tones[tone], className)}>
      {children}
    </span>
  )
}

export function Avatar({ src, alt, size = 40, corner }: { src?: string; alt: string; size?: number; corner?: string }) {
  return (
    <span
      className="relative inline-block shrink-0 overflow-hidden border border-[var(--color-line)] bg-[var(--color-bg-elev)]"
      style={{ width: size, height: size, borderColor: corner }}
    >
      {src ? (
        <img src={src} alt={alt} className="h-full w-full object-cover" loading="lazy" />
      ) : (
        <span className="flex h-full w-full items-center justify-center font-mono text-xs text-[var(--color-muted)]" aria-hidden>
          {alt.slice(0, 2).toUpperCase()}
        </span>
      )}
    </span>
  )
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="border border-[var(--color-line)] bg-[var(--color-bg-elev)] px-1.5 py-0.5 font-mono text-[0.65rem]">{children}</kbd>
}

export function SectionHeading({ prompt = '~/', children, sub }: { prompt?: string; children: ReactNode; sub?: string }) {
  return (
    <div className="mb-6">
      <h1 className="font-display text-2xl font-bold tracking-tight text-glow sm:text-3xl">
        <span aria-hidden className="text-[var(--accent-text)]">{prompt} </span>
        {children}
      </h1>
      {sub && <p className="mt-1 max-w-2xl text-sm text-[var(--color-muted)]">{sub}</p>}
    </div>
  )
}

export function Empty({ children }: { children: ReactNode }) {
  return (
    <div className="border border-dashed border-[var(--color-line)] p-8 text-center font-mono text-sm text-[var(--color-muted)]">
      {children}
    </div>
  )
}
