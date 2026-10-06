import type { ComponentProps } from 'react'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, data, MemoryRouter, Outlet, RouterProvider, useLoaderData } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { EventPage } from '../../src/pages/public/EventPage'
import { EventsList } from '../../src/pages/public/EventsList'
import { ToastProvider } from '../../src/context/ToastContext'
import EventRoute, { ErrorBoundary as EventError, meta as eventMeta } from '../../src/routes/event'
import EventsRoute, { meta as eventsMeta } from '../../src/routes/events'
import PublicRoute from '../../src/routes/layouts/public'
import { EVENT_COVER_FALLBACK, type EventPageData } from '../../src/server/mappers/events'
import type { Evento } from '../../src/data/types'

const evento = (n: number, extra: Partial<Evento> = {}): Evento => ({
  id: `0a000000-0000-4000-8000-00000000000${n}`,
  nome: `Evento sintético ${n}`,
  tipo: 'festa',
  descricao: '',
  inicio: '2026-10-07T15:00:00.000Z',
  fim: null,
  estado: 'PE',
  cidade: 'Recife',
  local: 'Local sintético',
  coletivoId: '05000000-0000-4000-8000-000000000001',
  lineup: [],
  gratuito: true,
  capa: EVENT_COVER_FALLBACK,
  ...extra,
})

const pageData = (extra: Partial<EventPageData> = {}, ev: Partial<Evento> = {}): EventPageData => ({
  evento: evento(1, {
    descricao: '**Fixture**, sem dados reais',
    lineup: [
      { artistaId: '02000000-0000-4000-8000-000000000001', nome: 'Artista sintético público' },
      { nome: 'Crédito sintético sem vínculo' },
    ],
    ...ev,
  }),
  periodo: 'future',
  situacao: 'published',
  coletivo: { id: '05000000-0000-4000-8000-000000000001', nome: 'Organização sintética 1', cor: null },
  ...extra,
})

const page = (props: EventPageData) =>
  render(
    <MemoryRouter>
      <ToastProvider>
        <EventPage {...props} />
      </ToastProvider>
    </MemoryRouter>,
  )

beforeEach(() => {
  vi.stubGlobal('matchMedia', vi.fn((query: string) => ({
    matches: false, media: query, addEventListener: vi.fn(), removeEventListener: vi.fn(),
  })))
})

describe('EventsList', () => {
  const list = (ongoing: Evento[], future: Evento[]) =>
    render(
      <MemoryRouter>
        <EventsList ongoing={ongoing} future={future} />
      </MemoryRouter>,
    )
  const names = () => screen.queryAllByRole('heading', { level: 3 }).map((h) => h.textContent)

  it('mostra em andamento antes dos futuros, preservando a ordem recebida, com links para o detalhe', () => {
    list([evento(2)], [evento(1), evento(6, { estado: 'CE', gratuito: false })])
    expect(names()).toEqual(['Evento sintético 2', 'Evento sintético 1', 'Evento sintético 6'])
    expect(screen.getAllByText('Em andamento')).toHaveLength(1)
    const card = screen.getByRole('heading', { name: 'Evento sintético 2' }).closest('li')!
    expect(within(card).getByText('Em andamento')).toBeTruthy()
    expect(screen.getByRole('link', { name: /Capa do evento Evento sintético 1/ }).getAttribute('href')).toBe(
      '/eventos/0a000000-0000-4000-8000-000000000001',
    )
  })

  it('filtra por UF no cliente e volta a mostrar tudo', async () => {
    const user = userEvent.setup()
    list([evento(2)], [evento(1), evento(6, { estado: 'CE' })])
    await user.click(screen.getByRole('button', { name: 'CE' }))
    expect(names()).toEqual(['Evento sintético 6'])
    await user.click(screen.getByRole('button', { name: 'CE' }))
    expect(names()).toHaveLength(3)
    await user.click(screen.getByRole('button', { name: 'PE' }))
    expect(names()).toEqual(['Evento sintético 2', 'Evento sintético 1'])
  })

  it('apresenta o estado vazio', () => {
    list([], [])
    expect(screen.getByText('Nenhum evento futuro cadastrado.')).toBeTruthy()
  })
})

describe('EventPage', () => {
  it('mostra nome, coletivo, line-up com e sem vínculo e a descrição em markdown', () => {
    const { container } = page(pageData())
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Evento sintético 1')
    expect(screen.getByRole('link', { name: 'Organização sintética 1' }).getAttribute('href')).toBe(
      '/coletivos/05000000-0000-4000-8000-000000000001',
    )
    expect(screen.getByRole('link', { name: 'Artista sintético público' }).getAttribute('href')).toBe(
      '/artistas/02000000-0000-4000-8000-000000000001',
    )
    expect(screen.getByText('Crédito sintético sem vínculo').closest('a')).toBeNull()
    expect(container.querySelector('strong')?.textContent).toBe('Fixture')
    expect(screen.getByText('07 out 2026 · 12:00 (Fortaleza)')).toBeTruthy()
    expect(screen.getByText('Não informado')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Entrada gratuita' })).toBeTruthy()
  })

  it('usa a cor do coletivo como destaque e o padrão quando não há cor', () => {
    const { container, rerender } = page(pageData({ coletivo: { id: 'c', nome: 'Col', cor: '#00ff99' } }))
    expect((container.firstElementChild as HTMLElement).style.getPropertyValue('--accent')).toBeTruthy()
    rerender(
      <MemoryRouter>
        <ToastProvider>
          <EventPage {...pageData({ coletivo: null })} />
        </ToastProvider>
      </MemoryRouter>,
    )
    expect(screen.queryByText(/^por /)).toBeNull()
  })

  it('evento pago oferece um único link de compra acessível', () => {
    page(pageData({}, { gratuito: false, ingressoLink: 'https://tickets.example.invalid/fixture', fim: '2026-10-08T03:00:00.000Z' }))
    const ingresso = screen.getByRole('link', { name: 'Comprar ingresso ↗' })
    expect(ingresso.getAttribute('href')).toBe('https://tickets.example.invalid/fixture')
    expect(ingresso.querySelector('button')).toBeNull()
    expect(screen.queryByText('Não informado')).toBeNull()
  })

  it('sinaliza evento passado, cancelado e rascunho, sem oferecer ingresso quando cancelado', () => {
    const past = page(pageData({ periodo: 'past' }))
    expect(screen.getByText('Evento passado')).toBeTruthy()
    past.unmount()
    const cancelled = page(pageData({ situacao: 'cancelled', periodo: 'past' }, { gratuito: false, ingressoLink: 'https://x.example.invalid' }))
    expect(screen.getByText('Cancelado')).toBeTruthy()
    expect(screen.queryByText('Evento passado')).toBeNull()
    expect(screen.queryByRole('link', { name: /Comprar ingresso/ })).toBeNull()
    cancelled.unmount()
    page(pageData({ situacao: 'draft' }))
    expect(screen.getByText('Rascunho')).toBeTruthy()
  })

  it('mantém a descrição maliciosa inerte', () => {
    const { container } = page(
      pageData({}, {
        descricao: '[abrir](https://example.org/"onmouseover="alert`1`)\n<img src=x onerror=alert(1)>\n[perigo](javascript:alert(1))\nLinha final',
      }),
    )
    const link = screen.getByRole('link', { name: 'abrir' })
    expect(link.getAttribute('href')).toBe('https://example.org/%22onmouseover=%22alert%601%60')
    expect(link.hasAttribute('onmouseover')).toBe(false)
    expect(container.querySelector('img[onerror]')).toBeNull()
    expect(screen.queryByRole('link', { name: 'perigo' })).toBeNull()
  })
})

describe('módulos de rota', () => {
  it('título vem dos dados do loader', () => {
    expect(eventsMeta()[0]).toEqual({ title: 'Eventos Programados · CIRCUITO NE' })
    const loaderData = pageData()
    expect(eventMeta({ loaderData } as never)[0]).toEqual({ title: 'Evento sintético 1 · CIRCUITO NE' })
    expect(eventMeta({ loaderData: undefined } as never)[0]).toEqual({ title: 'Evento não encontrado · CIRCUITO NE' })
  })

  const app = (path: string, child: Parameters<typeof createMemoryRouter>[0][number]) =>
    render(
      <RouterProvider
        router={createMemoryRouter(
          [{ id: 'root', path: '/', loader: () => ({ renderedAt: Date.parse('2026-10-06T12:00:00Z') }), Component: Outlet,
             children: [{ Component: PublicRoute, children: [child] }] }],
          { initialEntries: [path] },
        )}
      />,
    )

  it('renderiza a agenda dentro do layout público a partir do loader', async () => {
    app('/eventos', {
      path: 'eventos',
      loader: () => ({ ongoing: [evento(2)], future: [evento(1)] }),
      Component: () => <EventsRoute {...({ loaderData: useLoaderData() } as unknown as ComponentProps<typeof EventsRoute>)} />,
    })
    expect(await screen.findByRole('heading', { name: 'Evento sintético 2' })).toBeTruthy()
    expect(screen.getByRole('navigation', { name: 'Principal' })).toBeTruthy()
    expect(screen.getByText(/Hub cultural independente · 2026/)).toBeTruthy()
  })

  it('404 do loader mostra o estado "não encontrado" dentro do layout, com caminho de volta', async () => {
    app('/eventos/x', {
      path: 'eventos/:id',
      loader: () => { throw data({ message: 'Evento não encontrado.' }, { status: 404 }) },
      Component: EventRoute as never,
      ErrorBoundary: EventError,
    })
    expect(await screen.findByText(/Evento não encontrado\./)).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Voltar' }).getAttribute('href')).toBe('/eventos')
    expect(screen.getByRole('navigation', { name: 'Principal' })).toBeTruthy()
  })

  it('503 do loader mostra erro recuperável, não "não encontrado"', async () => {
    app('/eventos/x', {
      path: 'eventos/:id',
      loader: () => { throw data({ message: 'indisponível' }, { status: 503 }) },
      Component: EventRoute as never,
      ErrorBoundary: EventError,
    })
    expect(await screen.findByRole('alert')).toBeTruthy()
    expect(screen.queryByText(/Evento não encontrado\./)).toBeNull()
    expect(screen.getByText(/Tente novamente/)).toBeTruthy()
  })
})
