import { isRouteErrorResponse, Link, useRouteError } from 'react-router'
import { Empty } from './primitives'

/** Mensagem pt-BR que `supabaseLoader` põe no corpo (`data({ message })`) das respostas de erro. */
const bodyMessage = (data: unknown) =>
  typeof data === 'object' && data !== null && 'message' in data && typeof data.message === 'string' ? data.message : null

/**
 * ErrorBoundary body for data-backed routes: 404 shows the not-found state, 403 the reason access is denied,
 * anything else a retryable error. The title is visually hidden (the message is the visible text); `level="h2"`
 * is for routes that render under a layout which already has the page `h1` (the collective area).
 */
export function LoadError({ notFound, backTo, backLabel, level = 'h1' }: { notFound: string; backTo: string; backLabel: string; level?: 'h1' | 'h2' }) {
  const Heading = level
  const error = useRouteError()
  const missing = isRouteErrorResponse(error) && error.status === 404
  const forbidden = isRouteErrorResponse(error) && error.status === 403
  return (
    <div role={missing || forbidden ? undefined : 'alert'}>
      <Heading className="sr-only">{missing ? 'Não encontrado' : forbidden ? 'Acesso negado' : 'Erro ao carregar a página'}</Heading>
      <Empty>
        {missing
          ? notFound
          : forbidden
            ? (bodyMessage(error.data) ?? 'Você não tem acesso a esta página.')
            : 'Não foi possível carregar esta página agora. Tente novamente em instantes.'}{' '}
        <Link to={backTo} className="text-[var(--accent-text)] underline">{backLabel}</Link>
      </Empty>
    </div>
  )
}
