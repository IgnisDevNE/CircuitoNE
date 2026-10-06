import { useNavigation, useRouteLoaderData } from 'react-router'
import { LoadError } from '../components/ui/LoadError'
import { EditProfile } from '../pages/app/EditProfile'
import { loadProfileEdit, profileAction } from '../server/account-settings.server'
import { supabaseLoader, supabaseRouteHeaders } from '../server/supabase.server'
import type { loader as appLoader } from './layouts/app'
import type { Route } from './+types/profile-edit'

// Só o titular lê e edita a própria atuação: de outra conta (ou inexistente) responde 404 sem distinguir.
export const loader = ({ request, params }: Route.LoaderArgs) =>
  supabaseLoader(request, (client) => loadProfileEdit(client, params.atuacaoId))
export const action = ({ request, params }: Route.ActionArgs) => profileAction(request, params.atuacaoId)
export const headers = supabaseRouteHeaders

export const meta = ({ loaderData }: Route.MetaArgs) => [
  { title: `${loaderData?.perfil ? `Editar ${loaderData.perfil.nome}` : 'Editar Perfil'} · CIRCUITO NE` },
]

export default function ProfileEditRoute({ loaderData, actionData }: Route.ComponentProps) {
  const shell = useRouteLoaderData<typeof appLoader>('routes/layouts/app')
  const busy = useNavigation().state === 'submitting'
  if (shell?.status !== 'active' || !loaderData.perfil) return null
  // `key`: trocar de atuação descarta o rascunho da anterior.
  return <EditProfile key={loaderData.perfil.id} perfil={loaderData.perfil} taxonomia={loaderData.taxonomia} result={actionData} busy={busy} />
}

export function ErrorBoundary() {
  return <LoadError notFound="Atuação não encontrada." backTo="/painel/dados" backLabel="voltar aos dados" />
}
