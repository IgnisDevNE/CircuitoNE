import { useState, type ReactNode } from 'react'
import { Link, NavLink, useNavigate } from '../../router'
import { useStore } from '../../context/StoreContext'
import { cx } from '../../lib/utils'
import { Cursor } from '../ui/anim'

const NAV = [
  { to: '/artistas', label: 'Artistas' },
  { to: '/coletivos', label: 'Coletivos' },
  { to: '/eventos', label: 'Eventos' },
]

export function PublicLayout({ children }: { children: ReactNode }) {
  const { user } = useStore()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)

  return (
    <div className="crt-flicker flex min-h-screen flex-col">
      <a
        href="#conteudo"
        className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-[200] focus:border focus:border-[var(--accent)] focus:bg-[var(--color-bg-elev)] focus:px-3 focus:py-2 focus:font-mono focus:text-sm"
      >
        Pular para o conteúdo
      </a>

      <header className="sticky top-0 z-40 border-b border-[var(--color-line)] bg-[var(--color-bg)]/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <Link to="/" className="group flex items-center gap-2 font-display text-lg font-bold tracking-tight">
            <span aria-hidden className="text-[var(--accent-text)]">◢◤</span>
            <span>CIRCUITO<span className="text-[var(--accent-text)]">_</span>NE</span>
            <Cursor />
          </Link>

          <nav aria-label="Principal" className="hidden items-center gap-1 md:flex">
            {NAV.map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                className="px-3 py-2 font-mono text-sm uppercase tracking-widest text-[var(--color-muted)] transition-colors hover:text-[var(--foreground)]"
                activeClassName="!text-[var(--foreground)] border-b-2 border-[var(--accent)]"
              >
                {n.label}
              </NavLink>
            ))}
            {user ? (
              <Link to="/painel" className="ml-2 border border-[var(--accent)] px-3 py-2 font-mono text-sm uppercase tracking-widest text-[var(--foreground)] hover:bg-[var(--accent)]/15">
                Painel
              </Link>
            ) : (
              <Link to="/entrar" className="ml-2 border border-[var(--accent)] px-3 py-2 font-mono text-sm uppercase tracking-widest text-[var(--foreground)] hover:bg-[var(--accent)]/15">
                Entrar
              </Link>
            )}
          </nav>

          <button
            className="font-mono text-xl md:hidden"
            aria-expanded={open}
            aria-controls="mobile-nav"
            aria-label={open ? 'Fechar menu' : 'Abrir menu'}
            onClick={() => setOpen((o) => !o)}
          >
            {open ? '[x]' : '[≡]'}
          </button>
        </div>

        {open && (
          <nav id="mobile-nav" aria-label="Principal (móvel)" className="border-t border-[var(--color-line)] px-4 py-2 md:hidden">
            {NAV.map((n) => (
              <button
                key={n.to}
                onClick={() => {
                  navigate(n.to)
                  setOpen(false)
                }}
                className="block w-full py-2 text-left font-mono text-sm uppercase tracking-widest text-[var(--color-muted)] hover:text-[var(--foreground)]"
              >
                {n.label}
              </button>
            ))}
            <button
              onClick={() => {
                navigate(user ? '/painel' : '/entrar')
                setOpen(false)
              }}
              className="block w-full py-2 text-left font-mono text-sm uppercase tracking-widest text-[var(--accent-text)]"
            >
              {user ? 'Painel' : 'Entrar'}
            </button>
          </nav>
        )}
      </header>

      <main id="conteudo" className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
        {children}
      </main>

      <footer className="border-t border-[var(--color-line)] px-4 py-8">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 font-mono text-xs text-[var(--color-muted)] sm:flex-row sm:items-center sm:justify-between">
          <span>
            <span className="text-[var(--accent-text)]">$</span> circuito_ne --scene=eletronica --regiao=nordeste
          </span>
          <span>Hub cultural independente · {new Date().getFullYear()}</span>
        </div>
      </footer>
    </div>
  )
}
