import { isRouteErrorResponse, Links, Meta, Outlet, Scripts, ScrollRestoration, useRouteError } from 'react-router'
import { RouteA11y } from './components/layout/RouteA11y'
import './index.css'

export function meta() {
  return [
    { name: 'description', content: 'CircuitoNE: artistas, coletivos, eventos e profissionais da cena eletrônica.' },
  ]
}

/** Marca "◢◤" na cor de destaque; o .ico atende quem pede /favicon.ico sem ler o HTML. */
export function links() {
  return [
    { rel: 'icon', href: '/favicon.ico', sizes: '32x32' },
    { rel: 'icon', href: '/favicon.svg', type: 'image/svg+xml' },
  ]
}

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <head>
        <meta charSet="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="robots" content="noindex, nofollow" />
        <Meta />
        <Links />
      </head>
      <body>
        {children}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  )
}

export default function Root() {
  return (
    <>
      <RouteA11y />
      <Outlet />
    </>
  )
}

export function ErrorBoundary() {
  const error = useRouteError()
  const notFound = isRouteErrorResponse(error) && error.status === 404
  const title = notFound ? '404 — página não encontrada.' : 'Não foi possível abrir esta página.'
  return (
    <main id="conteudo" className="mx-auto max-w-xl px-4 py-12">
      <title>{`${notFound ? 'Página não encontrada' : 'Erro'} · CIRCUITO NE`}</title>
      <h1 className="font-display text-2xl">{title}</h1>
      <a href="/" className="mt-4 inline-block text-[var(--accent-text)] underline">voltar ao início</a>
    </main>
  )
}
