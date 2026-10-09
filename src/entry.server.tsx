import { PassThrough } from 'node:stream'

import type { EntryContext, RouterContextProvider } from 'react-router'
import { createReadableStreamFromReadable } from '@react-router/node'
import { ServerRouter } from 'react-router'
import { isbot } from 'isbot'
import type { RenderToPipeableStreamOptions } from 'react-dom/server'
import { renderToPipeableStream } from 'react-dom/server'
import { applySecurityHeaders, createNonce } from './server/security-headers'

/**
 * Entrada do servidor: igual à padrão do React Router para Node, mais a CSP com nonce por requisição e os cabeçalhos de
 * segurança do documento (ver `server/security-headers.ts`). O nonce vai ao `<ServerRouter nonce>`: o `<Scripts>`, o
 * `<ScrollRestoration>` e o `<Links>` de `root.tsx` o herdam do contexto do framework, sem prop alguma.
 */

export const streamTimeout = 5_000

export default function handleRequest(
  request: Request,
  responseStatusCode: number,
  responseHeaders: Headers,
  routerContext: EntryContext,
  _loadContext: RouterContextProvider,
) {
  const nonce = createNonce()
  applySecurityHeaders(responseHeaders, nonce, { dev: import.meta.env.DEV })

  // https://httpwg.org/specs/rfc9110.html#HEAD
  if (request.method.toUpperCase() === 'HEAD') {
    return new Response(null, {
      status: responseStatusCode,
      headers: responseHeaders,
    })
  }

  return new Promise<Response>((resolve, reject) => {
    let shellRendered = false
    const userAgent = request.headers.get('user-agent')

    // Bots e SPA Mode esperam todo o conteúdo antes de responder.
    const readyOption: keyof RenderToPipeableStreamOptions =
      (userAgent && isbot(userAgent)) || routerContext.isSpaMode ? 'onAllReady' : 'onShellReady'

    // Aborta a renderização depois do `streamTimeout` para dar tempo de enviar os limites rejeitados.
    let timeoutId: ReturnType<typeof setTimeout> | undefined = setTimeout(() => abort(), streamTimeout + 1000)

    const { pipe, abort } = renderToPipeableStream(<ServerRouter context={routerContext} url={request.url} nonce={nonce} />, {
      nonce,
      [readyOption]() {
        shellRendered = true
        const body = new PassThrough({
          final(callback) {
            // Limpa o timeout para não reter o closure (vazamento de memória).
            clearTimeout(timeoutId)
            timeoutId = undefined
            callback()
          },
        })
        const stream = createReadableStreamFromReadable(body)

        responseHeaders.set('Content-Type', 'text/html')

        pipe(body)

        resolve(new Response(stream, { headers: responseHeaders, status: responseStatusCode }))
      },
      onShellError(error: unknown) {
        reject(error)
      },
      onError(error: unknown) {
        responseStatusCode = 500
        // Erros de streaming depois do shell são registrados aqui; os do shell rejeitam e o framework os registra.
        if (shellRendered) console.error(error)
      },
    })
  })
}

/** Respostas de dados (`*.data`): sem sniffing de tipo, como as de documento. */
export function handleDataRequest(response: Response) {
  response.headers.set('X-Content-Type-Options', 'nosniff')
  return response
}
