import { ArtistsHub } from '../pages/public/ArtistsHub'
import { LoadError } from '../components/ui/LoadError'
import { loadArtistList } from '../server/artists.server'
import { supabaseLoader, supabaseRouteHeaders } from '../server/supabase.server'
import type { Route } from './+types/artists'

export const loader = ({ request }: Route.LoaderArgs) => supabaseLoader(request, loadArtistList, { anonymous: true })
export const headers = supabaseRouteHeaders

export const meta = () => [
  { title: 'Artistas · CIRCUITO NE' },
  { name: 'description', content: 'Artistas da cena eletrônica do Nordeste: filtre por nome ou estilo.' },
]

export default function ArtistsRoute({ loaderData }: Route.ComponentProps) {
  return <ArtistsHub artistas={loaderData.artistas} />
}

export function ErrorBoundary() {
  return <LoadError notFound="Página não encontrada." backTo="/" backLabel="voltar ao início" />
}
