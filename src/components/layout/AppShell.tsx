import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Link, NavLink, useLocation, useNavigate } from '../../router'
import { useStore } from '../../context/StoreContext'
import { TIPO_LABEL } from '../../data/types'
import { cx } from '../../lib/utils'
import { Avatar } from '../ui/primitives'

interface NavItem {
  to: string
  label: string
  hint?: string
}

export function AppShell({ children }: { children: ReactNode }) {
  const { user, logout, threads, coletivos } = useStore()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const loggingOut = useRef(false)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!user && !loggingOut.current && pathname !== '/') navigate('/entrar', { replace: true })
  }, [user, pathname, navigate])

  const naoLidas = threads.reduce((n, t) => n + t.naoLidas, 0)

  // Menus SOMAM conforme atuações do usuário
  const sections = useMemo(() => {
    if (!user) return []
    const geral: NavItem[] = [
      { to: '/', label: 'Início (site)', hint: 'voltar à vitrine pública' },
      { to: '/painel', label: 'Dashboard', hint: 'próximos eventos + mensagens' },
    ]
    const perfis: NavItem[] = user.atuacoes
      .filter((a) => a.tipo === 'artista') // apenas artista tem perfil público editável
      .map((a) => ({ to: `/painel/perfil/${a.id}`, label: `Perfil · ${a.nome}` }))
    const conta: NavItem[] = [
      { to: '/painel/dados', label: 'Editar Dados', hint: 'dados gerais + novas atuações' },
      { to: '/painel/seguranca', label: 'Segurança' },
      { to: '/painel/mensagens', label: `Mensagens${naoLidas ? ` (${naoLidas})` : ''}` },
    ]
    const coletivo: NavItem[] = user.atuacoes.some((a) => a.tipo === 'integrante')
      ? [{ to: '/painel/coletivos', label: 'Coletivos/Produtoras' }]
      : []

    // Admin de algum coletivo (nível 2) libera as buscas com dados não-públicos.
    const isAdmin = coletivos.some((c) =>
      c.membros.some((m) => m.userId === user.id && (c.cargos.find((cg) => cg.id === m.cargoId)?.nivel ?? 0) >= 2),
    )
    const explorar: NavItem[] = isAdmin
      ? [
          { to: '/painel/explorar/artistas', label: 'Explorar Artistas', hint: 'cachê, presskit, booking' },
          { to: '/painel/explorar/servicos', label: 'Explorar Serviços' },
          { to: '/painel/explorar/audiovisual', label: 'Explorar Audiovisual' },
          { to: '/painel/explorar/coletivos', label: 'Explorar Coletivos' },
        ]
      : []

    return [
      { title: 'geral', items: geral },
      ...(perfis.length ? [{ title: 'perfis', items: perfis }] : []),
      { title: 'conta', items: conta },
      ...(coletivo.length ? [{ title: 'coletivos', items: coletivo }] : []),
      ...(explorar.length ? [{ title: 'explorar (admin)', items: explorar }] : []),
    ]
  }, [user, naoLidas, coletivos])

  if (!user) return null

  const sidebar = (
    <nav aria-label="Painel" className="flex h-full flex-col gap-6 p-4">
      <div className="flex items-center gap-3 border-b border-[var(--color-line)] pb-4">
        <Avatar
          src={user.atuacoes.find((a): a is Extract<typeof a, { tipo: 'artista' }> => a.tipo === 'artista')?.fotoApresentacao}
          alt={user.nome}
          size={44}
        />
        <div className="min-w-0">
          <p className="truncate font-display text-sm font-bold">{user.nome}</p>
          <p className="truncate font-mono text-xs text-[var(--color-muted)]">
            {user.atuacoes.map((a) => TIPO_LABEL[a.tipo]).join(' + ')}
          </p>
        </div>
      </div>

      {sections.map((sec) => (
        <div key={sec.title}>
          <p className="mb-2 font-mono text-[0.65rem] uppercase tracking-[0.25em] text-[var(--color-muted)]">/{sec.title}</p>
          <ul className="space-y-0.5">
            {sec.items.map((it) => (
              <li key={it.to}>
                <NavLink
                  to={it.to}
                  end={it.to === '/painel'}
                  onClick={() => setOpen(false)}
                  className="block border-l-2 border-transparent px-3 py-2 font-mono text-sm text-[var(--color-muted)] transition-colors hover:bg-white/5 hover:text-[var(--foreground)]"
                  activeClassName="!border-[var(--accent)] !text-[var(--foreground)] bg-[color:color-mix(in_srgb,var(--accent)_12%,transparent)]"
                >
                  {it.label}
                </NavLink>
              </li>
            ))}
          </ul>
        </div>
      ))}

      <div className="mt-auto border-t border-[var(--color-line)] pt-4">
        <button
          onClick={() => {
            loggingOut.current = true
            logout()
            navigate('/')
          }}
          className="w-full px-3 py-2 text-left font-mono text-sm text-[var(--color-muted)] hover:text-[var(--accent-text)]"
        >
          [→] Sair da sessão
        </button>
      </div>
    </nav>
  )

  return (
    <div className="min-h-screen">
      <a href="#painel-conteudo" className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-[200] focus:border focus:border-[var(--accent)] focus:bg-[var(--color-bg-elev)] focus:px-3 focus:py-2 focus:font-mono focus:text-sm">
        Pular para o conteúdo
      </a>

      {/* topbar (mobile) */}
      <header className="sticky top-0 z-40 flex items-center justify-between border-b border-[var(--color-line)] bg-[var(--color-bg)]/90 px-4 py-3 backdrop-blur lg:hidden">
        <Link to="/" className="font-display font-bold">CIRCUITO<span className="text-[var(--accent-text)]">_</span>NE</Link>
        <button aria-expanded={open} aria-controls="painel-nav" aria-label="Menu do painel" onClick={() => setOpen((o) => !o)} className="font-mono text-xl">
          {open ? '[x]' : '[≡]'}
        </button>
      </header>

      <div className="mx-auto flex max-w-7xl">
        <aside id="painel-nav" className={cx('w-64 shrink-0 border-r border-[var(--color-line)] lg:sticky lg:top-0 lg:block lg:h-screen', open ? 'block' : 'hidden')}>
          {sidebar}
        </aside>
        <main id="painel-conteudo" className="min-w-0 flex-1 px-4 py-8 sm:px-6">
          {children}
        </main>
      </div>
    </div>
  )
}
