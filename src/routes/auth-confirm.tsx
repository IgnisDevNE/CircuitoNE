import { confirmLoader } from '../server/registration.server'
import type { Route } from './+types/auth-confirm'

// Rota de recurso (sem página): confirma o link do e-mail (`token_hash` + `type`, ou `code`) e redireciona.
// Precisa estar na lista de Redirect URLs do Auth: `APP_ORIGIN/auth/confirmar`.
export const loader = ({ request }: Route.LoaderArgs) => confirmLoader(request)
