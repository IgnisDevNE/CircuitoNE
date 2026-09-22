import { useParams, Link } from '../../router'
import { useStore } from '../../context/StoreContext'
import { useToast } from '../../context/ToastContext'
import { usePageTitle } from '../../lib/usePageTitle'
import { useColetivo } from '../../components/layout/CollectiveLayout'
import { Avatar, Badge, Button, Empty, Panel } from '../../components/ui/primitives'

export function PendingRequests() {
  const { id } = useParams()
  const { col, nivel } = useColetivo(id)
  const { aprovarSolicitacao, recusarSolicitacao } = useStore()
  const toast = useToast()
  usePageTitle(col ? `${col.nome} · Solicitações` : 'Solicitações')

  if (!col) return null
  if (nivel < 2) return <Empty>Apenas administradores (nível 2) podem gerenciar solicitações de acesso.</Empty>

  const solicitacoes = col.solicitacoes ?? []

  const aprovar = (solId: string, nome: string) => {
    aprovarSolicitacao(col.id, solId)
    toast(`${nome} aprovado(a) e adicionado(a) ao coletivo`, 'ok')
  }
  const recusar = (solId: string, nome: string) => {
    recusarSolicitacao(col.id, solId)
    toast(`Solicitação de ${nome} recusada`, 'warn')
  }

  return (
    <Panel title="solicitações pendentes">
      {solicitacoes.length === 0 ? (
        <Empty>Nenhuma solicitação de acesso pendente.</Empty>
      ) : (
        <ul className="space-y-2">
          {solicitacoes.map((s, i) => (
            <li
              key={s.id}
              className="animate-fade-up border border-[var(--color-line)] p-3"
              style={{ animationDelay: `${i * 90}ms` }}
            >
              <div className="flex flex-wrap items-center gap-3">
                <Avatar alt={s.nome} size={36} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    {s.artistaId ? (
                      <Link
                        to={`/artistas/${s.artistaId}`}
                        className="truncate font-mono text-sm text-[var(--accent-text)] underline"
                      >
                        {s.nome}
                      </Link>
                    ) : (
                      <span className="truncate font-mono text-sm">{s.nome}</span>
                    )}
                    <Badge tone="accent">{s.atuacaoDesejada}</Badge>
                  </span>
                  <span className="block font-mono text-xs text-[var(--color-muted)]">{s.data}</span>
                </span>
                <div className="flex gap-2">
                  <Button size="sm" onClick={() => aprovar(s.id, s.nome)}>aprovar</Button>
                  <Button size="sm" variant="danger" onClick={() => recusar(s.id, s.nome)}>recusar</Button>
                </div>
              </div>
              {s.mensagem && (
                <p className="mt-2 border-l-2 border-[var(--color-line)] pl-3 font-mono text-sm text-[var(--color-muted)]">
                  “{s.mensagem}”
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </Panel>
  )
}
