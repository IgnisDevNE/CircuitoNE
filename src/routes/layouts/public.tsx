import { Outlet, useLoaderData } from 'react-router'
import { PublicLayout } from '../../components/layout/PublicLayout'
import { headerSessionLoader } from '../../server/account.server'
import type { Route } from './+types/public'

/** Estado da sessão para o cabeçalho (Painel x Entrar): validado no servidor, e só quando há cookies de Auth. */
export const loader = ({ request }: Route.LoaderArgs) => headerSessionLoader(request)

/** Layout das páginas públicas: cabeçalho, conteúdo (`<main>`) e rodapé. */
export default function PublicRoute() {
  // Sem loader (testes de componente) não há sessão: cabeçalho de visitante.
  const session = useLoaderData<typeof loader>()
  return (
    <PublicLayout signedIn={session?.signedIn ?? false} name={session?.name}>
      <Outlet />
    </PublicLayout>
  )
}
