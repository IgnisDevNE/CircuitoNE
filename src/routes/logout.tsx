import type { ActionFunctionArgs } from 'react-router'
import { logoutAction, logoutLoader } from '../server/auth.server'
import { supabaseRouteHeaders } from '../server/supabase.server'

// POST /sair encerra a sessão e volta para /entrar; GET só redireciona (nunca encerra por link).
export const loader = () => logoutLoader()
export const action = ({ request }: ActionFunctionArgs) => logoutAction(request)
export const headers = supabaseRouteHeaders

export default function LogoutRoute() {
  return null
}
