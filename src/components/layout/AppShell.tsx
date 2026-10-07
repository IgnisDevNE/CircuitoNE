import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link, NavLink } from 'react-router'
import { TIPO_LABEL } from '../../data/types'
import { cx, navClass } from '../../lib/utils'
import type { MeuColetivo, MeuPerfil } from '../../server/mappers/account'
import { clearChatStorage } from '../chat/ChatDockProvider'
import { Avatar } from '../ui/primitives'

interface NavItem {
  to: string
  label: string
  hint?: string
}

const logoutClass =
  'w-full px-3 py-2 text-left font-mono text-sm text-[var(--color-muted)] hover:text-[var(--accent-text)]'

export interface AppShellProps {
  nome: string
  perfis: MeuPerfil[]
  coletivos: MeuColetivo[]
  naoLidas: number
  children: ReactNode
}

export function AppShell({ nome, perfis, coletivos, naoLidas, children }: AppShellProps) {
  const [open, setOpen] = useState(false)

  // Esc fecha o menu recolhido (celular).
  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && setOpen(false)
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open])

  // Menus SOMAM conforme as atuações e coletivos da conta
  const sections = useMemo(() => {
    const geral: NavItem[] = [
      { to: '/', label: 'Início (site)', hint: 'voltar à vitrine pública' },
      { to: '/painel', label: 'Dashboard', hint: 'próximos eventos + mensagens' },
    ]
    const itensPerfil: NavItem[] = perfis
      .filter((a) => a.tipo === 'artista') // apenas artista tem perfil público editável
      .map((a) => ({ to: `/painel/perfil/${a.id}`, label: `Perfil · ${a.nome}` }))
    const conta: NavItem[] = [
      { to: '/painel/dados', label: 'Editar Dados', hint: 'dados gerais + novas atuações' },
      { to: '/painel/seguranca', label: 'Segurança' },
      { to: '/painel/mensagens', label: `Mensagens${naoLidas ? ` (${naoLidas})` : ''}` },
    ]
    const itensColetivo: NavItem[] =
      coletivos.length > 0 || perfis.some((a) => a.tipo === 'integrante')
        ? [{ to: '/painel/coletivos', label: 'Coletivos/Produtoras' }]
        : []

    // Catálogo interno (RN-06): toda conta ativa o abre. Dados restritos (RN-07) dependem de o banco os devolver ao leitor.
    const explorar: NavItem[] = [
      { to: '/painel/explorar/artistas', label: 'Explorar Artistas', hint: 'cachê, presskit, booking' },
      { to: '/painel/explorar/servicos', label: 'Explorar Serviços' },
      { to: '/painel/explorar/audiovisual', label: 'Explorar Audiovisual' },
      { to: '/painel/explorar/coletivos', label: 'Explorar Coletivos' },
    ]

    return [
      { title: 'geral', items: geral },
      ...(itensPerfil.length ? [{ title: 'perfis', items: itensPerfil }] : []),
      { title: 'conta', items: conta },
      ...(itensColetivo.length ? [{ title: 'coletivos', items: itensColetivo }] : []),
      { title: 'explorar', items: explorar },
    ]
  }, [perfis, coletivos, naoLidas])

  const tipos = [...new Set(perfis.map((a) => TIPO_LABEL[a.tipo]))].join(' + ')

  const sidebar = (
    <nav aria-label="Painel" className="flex h-full flex-col gap-6 p-4">
      <div className="flex items-center gap-3 border-b border-[var(--color-line)] pb-4">
        <Avatar alt={nome} size={44} />
        <div className="min-w-0">
          <p className="truncate font-display text-sm font-bold">{nome}</p>
          <p className="truncate font-mono text-xs text-[var(--color-muted)]">{tipos}</p>
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
                  className={navClass('block border-l-2 border-transparent px-3 py-2 font-mono text-sm text-[var(--color-muted)] transition-colors hover:bg-white/5 hover:text-[var(--foreground)]', '!border-[var(--accent)] !text-[var(--foreground)] bg-[color:color-mix(in_srgb,var(--accent)_12%,transparent)]')}
                >
                  {it.label}
                </NavLink>
              </li>
            ))}
          </ul>
        </div>
      ))}

      <div className="mt-auto border-t border-[var(--color-line)] pt-4">
        <form method="post" action="/sair" onSubmit={clearChatStorage}>
          <button type="submit" className={logoutClass}>
            [→] Sair da sessão
          </button>
        </form>
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
        <main id="painel-conteudo" tabIndex={-1} className="min-w-0 flex-1 px-4 py-8 outline-none sm:px-6">
          {children}
        </main>
      </div>
    </div>
  )
}
