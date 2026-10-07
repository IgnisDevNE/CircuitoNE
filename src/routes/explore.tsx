import { LoadError } from '../components/ui/LoadError'
import { Explore } from '../pages/app/Explore'
import { loadExplore } from '../server/explore.server'
import { supabaseLoader, supabaseRouteHeaders } from '../server/supabase.server'
import type { Route } from './+types/explore'

// Usa os cookies do titular: o banco decide se os dados profissionais restritos voltam (RN-07); nada é filtrado aqui.
export const loader = ({ request, params }: Route.LoaderArgs) => supabaseLoader(request, (client) => loadExplore(client, params.kind))
export const headers = supabaseRouteHeaders

const TITLES: Record<string, string> = {
  artistas: 'explorar/artistas',
  servicos: 'explorar/serviços',
  audiovisual: 'explorar/audiovisual',
  coletivos: 'explorar/coletivos',
}

export const meta = ({ params }: Route.MetaArgs) => [{ title: `${TITLES[params.kind ?? ''] ?? 'Explorar'} · CIRCUITO NE` }]

export default function ExploreRoute({ loaderData }: Route.ComponentProps) {
  return <Explore data={loaderData} />
}

export function ErrorBoundary() {
  return <LoadError notFound="Página não encontrada." backTo="/painel/explorar/artistas" backLabel="voltar ao catálogo" />
}
