import { Outlet, useRouteLoaderData } from 'react-router'
import { PublicLayout } from '../../components/layout/PublicLayout'
import { StoreProvider } from '../../context/StoreContext'
import { ToastProvider } from '../../context/ToastContext'
import type { loader as rootLoader } from '../../root'

/**
 * Layout das páginas públicas já ligadas ao banco.
 * StoreProvider (relógio e usuário mock lidos pelo PublicLayout) e ToastProvider são
 * transitórios: saem junto com o protótipo (W4/W12).
 */
export default function PublicRoute() {
  const root = useRouteLoaderData<typeof rootLoader>('root')
  return (
    <StoreProvider initialNow={root?.renderedAt}>
      <ToastProvider>
        <PublicLayout>
          <Outlet />
        </PublicLayout>
      </ToastProvider>
    </StoreProvider>
  )
}
