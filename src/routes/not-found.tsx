export function loader() {
  throw new Response('Página não encontrada', { status: 404 })
}

export default function NotFound() {
  return null
}
