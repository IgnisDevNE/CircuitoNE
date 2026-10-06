import { Outlet, useLoaderData, useRouteLoaderData } from 'react-router'
import { PublicLayout } from '../../components/layout/PublicLayout'
import { StoreProvider } from '../../context/StoreContext'
import { ToastProvider } from '../../context/ToastContext'
import { headerSessionLoader } from '../../server/account.server'
import type { loader as rootLoader } from '../../root'
import type { Route } from './+types/public'

/** Estado da sessão para o cabeçalho (Painel x Entrar): validado no servidor, e só quando há cookies de Auth. */
export const loader = ({ request }: Route.LoaderArgs) => headerSessionLoader(request)

/**
 * Layout das páginas públicas já ligadas ao banco.
 * StoreProvider (relógio lido pelo PublicLayout) e ToastProvider são transitórios: saem junto com o protótipo (W12).
 */
export default function PublicRoute() {
  const root = useRouteLoaderData<typeof rootLoader>('root')
  // Sem loader (testes de componente) não há sessão: cabeçalho de visitante.
  const session = useLoaderData<typeof loader>()
  return (
    <StoreProvider initialNow={root?.renderedAt}>
      <ToastProvider>
        <PublicLayout signedIn={session?.signedIn ?? false} name={session?.name}>
          <Outlet />
        </PublicLayout>
      </ToastProvider>
    </StoreProvider>
  )
}
