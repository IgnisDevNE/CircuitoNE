import { Link } from '../../router'
import { useStore } from '../../context/StoreContext'
import { usePageTitle } from '../../lib/usePageTitle'
import { Empty, LinkButton, Panel } from '../../components/ui/primitives'
import { BootLog } from '../../components/ui/anim'
import { eventoNaoEncerrado, fmtDataHora, porProximidade } from '../../lib/utils'
import { TIPO_LABEL } from '../../data/types'

export function Dashboard() {
  usePageTitle('Dashboard')
  const { user, eventos, threads, coletivos, now } = useStore()
  if (!user) return null

  const meusColetivos = coletivos.filter((c) => c.membros.some((m) => m.userId === user.id))
  const proximos = eventos
    .filter((e) => eventoNaoEncerrado(e, now) && meusColetivos.some((c) => c.id === e.coletivoId))
    .sort((a, b) => porProximidade(a, b, now))
  const ultimasMensagens = threads
    .flatMap((t) => t.mensagens.map((m) => ({ ...m, thread: t.titulo, threadId: t.id })))
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    .slice(0, 5)

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-3xl font-bold text-glow">
          olá, {user.nome.split(' ')[0]}<span className="cursor-blink text-[var(--accent-text)]">_</span>
        </h1>
        <p className="mt-2 font-mono text-xs uppercase tracking-widest text-[var(--color-muted)]">atuações ativas</p>
        <ul className="mt-1 space-y-1 font-mono text-sm">
          {user.atuacoes.map((a, i) => (
            <li key={a.id} className="animate-fade-up flex items-center gap-2" style={{ animationDelay: `${i * 120}ms` }}>
              <span aria-hidden className="text-[var(--color-ok)]">›</span>
              <span className="text-[var(--foreground)]">{TIPO_LABEL[a.tipo]}</span>
              <span className="text-[var(--color-muted)]">— {a.nome}</span>
            </li>
          ))}
        </ul>
      </header>

      <div className="grid gap-6 lg:grid-cols-3">
        <BootLog className="border border-[var(--color-line)] p-4 lg:col-span-3" lines={[
          `sessão: ${user.email}`,
          `coletivos vinculados: ${meusColetivos.length}`,
          `eventos futuros: ${proximos.length}`,
          `threads: ${threads.length} · não lidas: ${threads.reduce((n, t) => n + t.naoLidas, 0)}`,
        ]} />

        <Panel title="próximos eventos" className="lg:col-span-2">
          {proximos.length === 0 ? (
            <Empty>Nenhum evento dos seus coletivos. <Link to="/painel/coletivos" className="text-[var(--accent-text)] underline">gerenciar coletivos</Link></Empty>
          ) : (
            <ul className="space-y-2">
              {proximos.map((e) => (
                <li key={e.id}>
                  <Link to={`/eventos/${e.id}`} className="flex items-center justify-between gap-4 border border-[var(--color-line)] p-3 hover:border-[var(--accent)]">
                    <span>
                      <span className="block font-display font-bold">{e.nome}</span>
                      <span className="font-mono text-xs text-[var(--color-muted)]">{fmtDataHora(e.inicio)} · {e.cidade}/{e.estado}</span>
                    </span>
                    <span aria-hidden className="text-[var(--accent-text)]">→</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="últimas mensagens" actions={<LinkButton to="/painel/mensagens" size="sm" variant="ghost">abrir</LinkButton>}>
          {ultimasMensagens.length === 0 ? (
            <Empty>Sem mensagens.</Empty>
          ) : (
            <ul className="space-y-3">
              {ultimasMensagens.map((m) => (
                <li key={m.id} className="border-l-2 border-[var(--color-line)] pl-3">
                  <p className="font-mono text-xs text-[var(--accent-text)]">{m.autorNome} · {m.thread}</p>
                  <p className="line-clamp-2 text-sm text-[var(--color-muted)]">{m.texto}</p>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  )
}
