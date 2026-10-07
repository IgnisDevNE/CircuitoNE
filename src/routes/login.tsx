import { useActionData, useLoaderData, useNavigation, type ActionFunctionArgs, type LoaderFunctionArgs } from 'react-router'
import { Login } from '../pages/auth/Login'
import { loginAction, loginLoader, type LoginData } from '../server/auth.server'
import { supabaseRouteHeaders } from '../server/supabase.server'

// Entrar com e-mail e senha: quem já tem sessão segue para /painel (o layout autenticado mostra o aviso de conta restrita).
export const loader = ({ request }: LoaderFunctionArgs) => loginLoader(request)
export const action = ({ request }: ActionFunctionArgs) => loginAction(request)
export const headers = supabaseRouteHeaders
export const meta = () => [{ title: 'Entrar · CIRCUITO NE' }]

export default function LoginRoute() {
  const loaded = useLoaderData<LoginData>()
  const submitted = useActionData<LoginData>()
  const busy = useNavigation().state !== 'idle'
  return <Login error={submitted?.error ?? loaded?.error} email={submitted?.email} busy={busy} />
}
