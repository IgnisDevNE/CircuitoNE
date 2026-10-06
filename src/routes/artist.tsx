import { ArtistProfile } from '../pages/public/ArtistProfile'
import { LoadError } from '../components/ui/LoadError'
import { loadArtistPage } from '../server/artists.server'
import { supabaseLoader, supabaseRouteHeaders } from '../server/supabase.server'
import { useRouteLoaderData } from 'react-router'
import type { loader as publicLoader } from './layouts/public'
import type { Route } from './+types/artist'

export const loader = ({ request, params }: Route.LoaderArgs) =>
  supabaseLoader(request, (client) => loadArtistPage(client, params.id), { anonymous: true })
export const headers = supabaseRouteHeaders

export const meta = ({ loaderData }: Route.MetaArgs) => [
  { title: `${loaderData?.artista.nome ?? 'Artista não encontrado'} · CIRCUITO NE` },
  { name: 'description', content: 'CircuitoNE: artistas, coletivos, eventos e profissionais da cena eletrônica.' },
]

export default function ArtistRoute({ loaderData }: Route.ComponentProps) {
  // A sessão do cabeçalho vem do layout público (sem ele, como em testes de componente, não há ação de mensagem).
  const sessao = useRouteLoaderData<typeof publicLoader>('routes/layouts/public')
  return <ArtistProfile {...loaderData} sessao={sessao ?? null} />
}

export function ErrorBoundary() {
  return <LoadError notFound="Artista não encontrado." backTo="/artistas" backLabel="Voltar ao hub" />
}
