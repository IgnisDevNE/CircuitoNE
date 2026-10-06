// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'

const supabaseLoader = vi.hoisted(() => vi.fn(async (..._args: unknown[]) => null))
vi.mock('../../src/server/supabase.server', async (original) => ({
  ...(await original<typeof import('../../src/server/supabase.server')>()),
  supabaseLoader,
}))

import { loader as collectiveLoader } from '../../src/routes/collective'
import { loader as collectivesLoader } from '../../src/routes/collectives'
import { loader as eventLoader } from '../../src/routes/event'
import { loader as eventsLoader } from '../../src/routes/events'

const id = '0a000000-0000-4000-8000-000000000005'
const request = new Request('https://circuitone-dev.magalz.space/eventos', { headers: { Cookie: 'sb-x-auth-token=sessao' } })

beforeEach(() => supabaseLoader.mockClear())

describe('páginas públicas de eventos e coletivos', () => {
  // Para uma conta logada, get_event também devolve rascunhos a quem edita: a página pública lê como visitante.
  it.each([
    ['agenda de eventos', () => eventsLoader({ request, params: {} } as never)],
    ['detalhe do evento', () => eventLoader({ request, params: { id } } as never)],
    ['lista de coletivos', () => collectivesLoader({ request, params: {} } as never)],
    ['detalhe do coletivo', () => collectiveLoader({ request, params: { id } } as never)],
  ])('%s: lê como visitante anônimo, ignorando os cookies da sessão', async (_name, run) => {
    await run()
    expect(supabaseLoader).toHaveBeenCalledTimes(1)
    expect(supabaseLoader.mock.calls[0][2]).toEqual({ anonymous: true })
  })
})
