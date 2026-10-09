import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { EventSheet, EventSheetLink } from '../../src/components/ui/EventSheet'
import { EventPage } from '../../src/pages/public/EventPage'
import { EVENT_COVER_FALLBACK, type EventPageData } from '../../src/server/mappers/events'
import type { Evento } from '../../src/data/types'

const ID = '0a000000-0000-4000-8000-000000000001'

const evento = (extra: Partial<Evento> = {}): Evento => ({
  id: ID,
  nome: 'Evento sintético 1',
  tipo: 'festa',
  descricao: 'Descrição **sintética**',
  inicio: '2026-10-07T15:00:00.000Z',
  fim: null,
  estado: 'PE',
  cidade: 'Recife',
  local: 'Local sintético',
  coletivoId: '05000000-0000-4000-8000-000000000001',
  lineup: [{ artistaId: '02000000-0000-4000-8000-000000000001', nome: 'Artista sintético público' }],
  gratuito: true,
  capa: EVENT_COVER_FALLBACK,
  ...extra,
})

const pageData = (extra: Partial<EventPageData> = {}): EventPageData => ({
  evento: evento(),
  periodo: 'future',
  situacao: 'published',
  coletivo: { id: '05000000-0000-4000-8000-000000000001', nome: 'Organização sintética 1', cor: null },
  ...extra,
})

type Reply = Response | Promise<Response>
let reply: () => Reply
let requests: string[]

/** jsdom não implementa `<dialog>.showModal()`/`close()`: o stub abre/fecha o atributo e dispara `close` como o navegador. */
function stubDialog() {
  const proto = HTMLDialogElement.prototype
  proto.showModal = vi.fn(function (this: HTMLDialogElement) {
    this.setAttribute('open', '')
  })
  proto.close = vi.fn(function (this: HTMLDialogElement) {
    this.removeAttribute('open')
    this.dispatchEvent(new Event('close'))
  })
}

beforeEach(() => {
  requests = []
  reply = () => Response.json(pageData())
  stubDialog()
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string | URL | Request) => {
      requests.push(String(input))
      return reply()
    }),
  )
  vi.stubGlobal('matchMedia', vi.fn((query: string) => ({ matches: false, media: query, addEventListener: vi.fn(), removeEventListener: vi.fn() })))
})

const setup = () => {
  render(
    <MemoryRouter initialEntries={['/painel']}>
      <Routes>
        <Route
          path="/painel"
          element={
            <main>
              <h1>Painel</h1>
              <EventSheetLink eventId={ID} nome="Evento sintético 1">Evento sintético 1 · Recife/PE</EventSheetLink>
            </main>
          }
        />
        <Route path="/eventos/:id" element={<main><h1>Página do evento</h1></main>} />
      </Routes>
    </MemoryRouter>,
  )
  return screen.getByRole('link', { name: /Evento sintético 1 · Recife/ })
}

const sheet = () => screen.getByRole('dialog', { hidden: true })

describe('EventSheetLink', () => {
  it('continua um link para a página pública do evento', () => {
    const link = setup()
    expect(link.getAttribute('href')).toBe(`/eventos/${ID}`)
    expect(screen.queryByRole('dialog', { hidden: true })).toBeNull()
  })

  it('clique comum abre o painel, carrega o evento e não navega', async () => {
    const user = userEvent.setup()
    let release!: () => void
    reply = () => new Promise<Response>((resolve) => (release = () => resolve(Response.json(pageData()))))
    const link = setup()
    await user.click(link)
    expect(sheet().hasAttribute('open')).toBe(true)
    expect(HTMLDialogElement.prototype.showModal).toHaveBeenCalledTimes(1)
    // Enquanto carrega: nome do evento como título do diálogo e aviso de estado.
    expect(sheet().getAttribute('aria-labelledby')).toBeTruthy()
    expect(within(sheet()).getByRole('status', { hidden: true }).textContent).toBe('carregando evento…')
    expect(within(sheet()).getByRole('heading', { level: 2, name: 'Evento sintético 1', hidden: true }).id).toBe(sheet().getAttribute('aria-labelledby'))
    release()
    await waitFor(() => expect(within(sheet()).getByRole('status', { hidden: true }).textContent).toBe(''))
    expect(requests).toEqual([`/api/eventos/${ID}`])
    const heading = within(sheet()).getByRole('heading', { level: 2, name: 'Evento sintético 1', hidden: true })
    expect(sheet().getAttribute('aria-labelledby')).toBe(heading.id)
    expect(within(sheet()).queryByRole('heading', { level: 1, hidden: true })).toBeNull()
    expect(within(sheet()).queryByRole('link', { name: '← eventos/', hidden: true })).toBeNull()
    expect(within(sheet()).getByRole('link', { name: 'abrir página do evento ↗', hidden: true }).getAttribute('href')).toBe(`/eventos/${ID}`)
    expect(screen.queryByRole('heading', { name: 'Página do evento' })).toBeNull()
  })

  it.each([
    ['Ctrl', { ctrlKey: true }],
    ['Cmd', { metaKey: true }],
    ['Shift', { shiftKey: true }],
    ['Alt', { altKey: true }],
    ['botão do meio', { button: 1 }],
  ])('clique com %s não abre o painel (o navegador decide)', (_label, init) => {
    const link = setup()
    // O clique não é interceptado: o painel não abre e nenhuma busca é feita (o navegador cuida de nova aba/janela).
    fireEvent.click(link, init)
    expect(screen.queryByRole('dialog', { hidden: true })).toBeNull()
    expect(requests).toEqual([])
  })

  it('o botão de fechar fecha o painel e devolve o foco ao link', async () => {
    const user = userEvent.setup()
    const link = setup()
    await user.click(link)
    await user.click(within(sheet()).getByRole('button', { name: 'fechar', hidden: true }))
    expect(screen.queryByRole('dialog', { hidden: true })).toBeNull()
    expect(document.activeElement).toBe(link)
  })

  it('Esc (evento close do diálogo) fecha o painel e devolve o foco ao link', async () => {
    const user = userEvent.setup()
    const link = setup()
    await user.click(link)
    fireEvent(sheet(), new Event('close'))
    expect(screen.queryByRole('dialog', { hidden: true })).toBeNull()
    expect(document.activeElement).toBe(link)
  })

  it('clique no fundo fecha; clique no conteúdo ou arrastar de dentro para fora não', async () => {
    const user = userEvent.setup()
    const link = setup()
    await user.click(link)
    await screen.findByRole('heading', { level: 2, name: 'Evento sintético 1', hidden: true })
    await user.click(within(sheet()).getByRole('heading', { level: 2, name: 'Evento sintético 1', hidden: true }))
    expect(sheet()).toBeTruthy()
    // Pressiona dentro e solta no fundo (seleção de texto): não fecha.
    fireEvent.pointerDown(within(sheet()).getByRole('heading', { level: 2, name: 'Evento sintético 1', hidden: true }))
    fireEvent.click(sheet())
    expect(sheet()).toBeTruthy()
    // Pressiona e solta no fundo (o próprio diálogo): fecha.
    fireEvent.pointerDown(sheet())
    fireEvent.click(sheet())
    expect(screen.queryByRole('dialog', { hidden: true })).toBeNull()
    expect(document.activeElement).toBe(link)
  })

  it('pode reabrir depois de fechar', async () => {
    const user = userEvent.setup()
    const link = setup()
    await user.click(link)
    await user.click(within(sheet()).getByRole('button', { name: 'fechar', hidden: true }))
    await user.click(link)
    expect(sheet().hasAttribute('open')).toBe(true)
    expect(requests).toHaveLength(2)
  })

  it('"abrir página do evento" leva à página pública', async () => {
    const user = userEvent.setup()
    const link = setup()
    await user.click(link)
    await user.click(within(sheet()).getByRole('link', { name: 'abrir página do evento ↗', hidden: true }))
    expect(screen.getByRole('heading', { level: 1, name: 'Página do evento' })).toBeTruthy()
  })
})

describe('EventSheet: erros', () => {
  const open = () => render(<MemoryRouter><EventSheet id={ID} nome="Evento sintético 1" onClose={vi.fn()} /></MemoryRouter>)

  it('404: evento não encontrado ou despublicado, sem tentar de novo', async () => {
    reply = () => Response.json({ error: 'Evento não encontrado.' }, { status: 404 })
    open()
    const alert = await screen.findByRole('alert', { hidden: true })
    expect(alert.textContent).toContain('Evento não encontrado ou não está mais publicado.')
    expect(within(alert).queryByRole('button', { name: 'tentar de novo', hidden: true })).toBeNull()
    expect(within(sheet()).getByRole('heading', { level: 2, name: 'Evento sintético 1', hidden: true }).id).toBe(sheet().getAttribute('aria-labelledby'))
  })

  it('outros erros: mensagem e "tentar de novo", que busca de novo', async () => {
    const user = userEvent.setup()
    reply = () => Response.json({ error: 'Serviço temporariamente indisponível. Tente novamente.' }, { status: 503 })
    open()
    const alert = await screen.findByRole('alert', { hidden: true })
    expect(alert.textContent).toContain('Serviço temporariamente indisponível. Tente novamente.')
    reply = () => Response.json(pageData())
    await user.click(within(alert).getByRole('button', { name: 'tentar de novo', hidden: true }))
    await screen.findByRole('link', { name: 'Artista sintético público', hidden: true })
    expect(screen.queryByRole('alert', { hidden: true })).toBeNull()
    expect(requests).toHaveLength(2)
  })

  it('falha de rede cai na mensagem de conexão, com nova tentativa', async () => {
    reply = () => Promise.reject(new TypeError('failed to fetch'))
    open()
    const alert = await screen.findByRole('alert', { hidden: true })
    expect(alert.textContent).toContain('Sem conexão com o servidor.')
    expect(within(alert).getByRole('button', { name: 'tentar de novo', hidden: true })).toBeTruthy()
  })

  it('resposta que não é um evento (corpo vazio) vira erro genérico', async () => {
    reply = () => new Response('<html>erro</html>', { status: 200 })
    open()
    const alert = await screen.findByRole('alert', { hidden: true })
    expect(alert.textContent).toContain('Não foi possível carregar o evento agora.')
  })
})

describe('EventPage compacto', () => {
  const view = (compacto: boolean) =>
    render(
      <MemoryRouter>
        <EventPage {...pageData()} compacto={compacto} titleId="titulo" />
      </MemoryRouter>,
    )

  it('compacto: h2 com o id do título, sem o link "← eventos/" e em uma coluna', () => {
    const { container } = view(true)
    const heading = screen.getByRole('heading', { level: 2, name: 'Evento sintético 1' })
    expect(heading.id).toBe('titulo')
    expect(screen.queryByRole('heading', { level: 1 })).toBeNull()
    expect(screen.queryByRole('link', { name: '← eventos/' })).toBeNull()
    expect(container.querySelector('.lg\\:grid-cols-\\[1fr_320px\\]')).toBeNull()
    // O conteúdo continua inteiro: coletivo, descrição, detalhes e line-up.
    expect(screen.getByRole('link', { name: 'Organização sintética 1' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Artista sintético público' })).toBeTruthy()
    expect(screen.getByText('Entrada gratuita — é só chegar!')).toBeTruthy()
  })

  it('padrão: h1, link de volta e duas colunas, como antes', () => {
    const { container } = view(false)
    expect(screen.getByRole('heading', { level: 1, name: 'Evento sintético 1' })).toBeTruthy()
    expect(screen.getByRole('link', { name: '← eventos/' }).getAttribute('href')).toBe('/eventos')
    expect(container.querySelector('.lg\\:grid-cols-\\[1fr_320px\\]')).not.toBeNull()
  })
})
