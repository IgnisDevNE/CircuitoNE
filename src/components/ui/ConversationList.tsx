import { Link } from '../../router'
import { cx } from '../../lib/utils'
import type { ConversaItem } from '../../server/mappers/messages'
import { Badge, Empty } from './primitives'

export interface ConversationListProps {
  basePath: string
  conversas: ConversaItem[]
  abertaId?: string
  limitada?: boolean
}

/** Lista de conversas com a última mensagem (texto puro) e as não lidas. */
export function ConversationList({ basePath, conversas, abertaId, limitada = false }: ConversationListProps) {
  if (conversas.length === 0) return <Empty>Nenhuma conversa ainda.</Empty>
  return (
    <nav aria-label="Conversas">
      <ul className="space-y-1">
        {conversas.map((c) => (
          <li key={c.id}>
            <Link
              to={`${basePath}/${c.id}`}
              aria-current={c.id === abertaId ? 'true' : undefined}
              className={cx(
                'block border-l-2 px-3 py-2 text-left font-mono text-sm transition-colors',
                c.id === abertaId
                  ? 'border-[var(--accent)] bg-[color:color-mix(in_srgb,var(--accent)_12%,transparent)] text-[var(--foreground)]'
                  : 'border-transparent text-[var(--color-muted)] hover:text-[var(--foreground)]',
              )}
            >
              <span className="flex items-center justify-between gap-2">
                <span className="min-w-0 truncate">{c.titulo}</span>
                <span className="flex shrink-0 items-center gap-1">
                  {c.bloqueada && <Badge tone="warn">bloqueada</Badge>}
                  {c.arquivada && <Badge>arquivada</Badge>}
                  {c.naoLidas > 0 && (
                    <Badge tone="accent">
                      <span aria-hidden>{c.naoLidas}</span>
                      <span className="sr-only">{c.naoLidas === 1 ? '1 não lida' : `${c.naoLidas} não lidas`}</span>
                    </Badge>
                  )}
                </span>
              </span>
              {c.ultima && (
                <span className="mt-0.5 block truncate text-xs text-[var(--color-muted)]">
                  {c.ultima.minha ? 'Você: ' : c.meus.length > 1 ? `${c.ultima.autor.nome}: ` : ''}
                  {c.ultima.texto}
                </span>
              )}
            </Link>
          </li>
        ))}
      </ul>
      {limitada && <p className="mt-2 font-mono text-xs text-[var(--color-muted)]">Mostrando as 50 conversas mais recentes.</p>}
    </nav>
  )
}
