import { useEffect, useRef, useState, type ReactNode } from 'react'
import { cx } from '../../lib/utils'

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const on = () => setReduced(mq.matches)
    on()
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])
  return reduced
}

export function Cursor() {
  return (
    <span aria-hidden className="cursor-blink ml-0.5 inline-block h-[1em] w-[0.55ch] translate-y-[0.1em] bg-[var(--accent)]" />
  )
}

/** Typewriter effect. Full text is present for screen readers; visual reveal only. */
export function TypeText({ text, className, speed = 24, as = 'span' }: { text: string; className?: string; speed?: number; as?: 'span' | 'p' | 'h1' | 'h2' }) {
  const reduced = usePrefersReducedMotion()
  const [shown, setShown] = useState(reduced ? text.length : 0)
  useEffect(() => {
    if (reduced) {
      setShown(text.length)
      return
    }
    setShown(0)
    let i = 0
    const id = setInterval(() => {
      i++
      setShown(i)
      if (i >= text.length) clearInterval(id)
    }, speed)
    return () => clearInterval(id)
  }, [text, speed, reduced])
  const Tag = as as 'span'
  return (
    <Tag className={className}>
      <span aria-hidden>{text.slice(0, shown)}</span>
      <span className="sr-only">{text}</span>
    </Tag>
  )
}

export function GlitchText({ children, className }: { children: string; className?: string }) {
  const [glitch, setGlitch] = useState(false)
  const reduced = usePrefersReducedMotion()
  return (
    <span
      className={cx('relative inline-block', className)}
      onMouseEnter={() => !reduced && setGlitch(true)}
      onAnimationEnd={() => setGlitch(false)}
    >
      {children}
      {glitch && (
        <>
          <span aria-hidden className="absolute left-0 top-0 text-[var(--accent)]" style={{ animation: 'glitch-x 0.4s steps(2) 1' }}>
            {children}
          </span>
          <span aria-hidden className="absolute left-0 top-0 text-[color:var(--color-ok)]" style={{ animation: 'glitch-x 0.4s steps(3) 1 reverse' }}>
            {children}
          </span>
        </>
      )}
    </span>
  )
}

/** Terminal boot log — reveals lines sequentially. Decorative. */
export function BootLog({ lines, className }: { lines: string[]; className?: string }) {
  const reduced = usePrefersReducedMotion()
  const [n, setN] = useState(reduced ? lines.length : 0)
  useEffect(() => {
    if (reduced) return
    setN(0)
    const id = setInterval(() => setN((v) => (v >= lines.length ? v : v + 1)), 260)
    return () => clearInterval(id)
  }, [lines, reduced])
  return (
    <div aria-hidden className={cx('font-mono text-xs text-[var(--color-muted)]', className)}>
      {lines.slice(0, n).map((l, i) => (
        <div key={i} className="animate-fade-up">
          <span className="text-[var(--color-ok)]">›</span> {l}
        </div>
      ))}
    </div>
  )
}

export function AsciiSpinner({ label = 'carregando' }: { label?: string }) {
  const frames = ['|', '/', '-', '\\']
  const [i, setI] = useState(0)
  const reduced = usePrefersReducedMotion()
  useEffect(() => {
    if (reduced) return
    const id = setInterval(() => setI((v) => (v + 1) % frames.length), 120)
    return () => clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reduced])
  return (
    <span role="status" className="font-mono text-[var(--accent-text)]">
      <span aria-hidden>[{frames[i]}]</span> <span>{label}…</span>
    </span>
  )
}

/** Decorative moving scanline overlay for hero sections. */
export function ScanBeam() {
  const reduced = usePrefersReducedMotion()
  if (reduced) return null
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-x-0 top-0 h-16 opacity-30"
      style={{
        background: 'linear-gradient(to bottom, color-mix(in srgb, var(--accent) 40%, transparent), transparent)',
        animation: 'scan 7s linear infinite',
      }}
    />
  )
}

export function Reveal({ children, delay = 0 }: { children: ReactNode; delay?: number }) {
  const ref = useRef<HTMLDivElement>(null)
  return (
    <div ref={ref} className="animate-fade-up" style={{ animationDelay: `${delay}ms` }}>
      {children}
    </div>
  )
}
