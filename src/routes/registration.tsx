import { useNavigation, type MetaFunction } from 'react-router'
import { LoadError } from '../components/ui/LoadError'
import { RegisterFlow } from '../pages/auth/RegisterFlow'
import type { RegistrationPage } from '../lib/registration-forms'
import { registerAction, registrationLoader } from '../server/registration.server'
import { supabaseRouteHeaders } from '../server/supabase.server'
import LegacyRoute, { meta as fixtureMeta } from './legacy'
import type { Route } from './+types/registration'

// Cadastro real (e-mail, celular por SMS, dados e primeira atuação): retoma na etapa certa pelo estado do Auth e do banco.
// Fora do runtime `development` (preview das suítes e do protótipo) continua o protótipo, como antes.
export const loader = ({ request }: Route.LoaderArgs) => registrationLoader(request)
export const action = ({ request }: Route.ActionArgs) => registerAction(request)
export const headers = supabaseRouteHeaders

export const meta: MetaFunction = (args) =>
  (args.loaderData as RegistrationPage | undefined) && 'preview' in (args.loaderData as RegistrationPage)
    ? fixtureMeta(args)
    : [{ title: 'Cadastro · CIRCUITO NE' }]

export default function RegistrationRoute({ loaderData, actionData }: Route.ComponentProps) {
  const busy = useNavigation().state === 'submitting'
  if ('preview' in loaderData) return <LegacyRoute />
  return <RegisterFlow page={loaderData} result={actionData} busy={busy} />
}

export function ErrorBoundary() {
  return <LoadError notFound="Página não encontrada." backTo="/" backLabel="voltar ao início" />
}
