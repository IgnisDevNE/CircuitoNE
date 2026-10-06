import { isRouteErrorResponse, Link, useRouteError } from 'react-router'
import { Empty } from './primitives'

/** ErrorBoundary body for data-backed routes: 404 shows the not-found state, anything else a retryable error. */
export function LoadError({ notFound, backTo, backLabel }: { notFound: string; backTo: string; backLabel: string }) {
  const error = useRouteError()
  const missing = isRouteErrorResponse(error) && error.status === 404
  return (
    <div role={missing ? undefined : 'alert'}>
      <Empty>
        {missing ? notFound : 'Não foi possível carregar esta página agora. Tente novamente em instantes.'}{' '}
        <Link to={backTo} className="text-[var(--accent-text)] underline">{backLabel}</Link>
      </Empty>
    </div>
  )
}
