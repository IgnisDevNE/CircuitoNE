import type { ComponentProps } from 'react'
import { render, screen, within } from '@testing-library/react'
import { createMemoryRouter, data, MemoryRouter, RouterProvider, useLoaderData } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CollectiveProfile } from '../../src/pages/public/CollectiveProfile'
import { CollectivesHub } from '../../src/pages/public/CollectivesHub'
import CollectiveRoute, { ErrorBoundary as CollectiveError, meta as collectiveMeta } from '../../src/routes/collective'
import CollectivesRoute, { ErrorBoundary as CollectivesError, meta as collectivesMeta } from '../../src/routes/collectives'
import PublicRoute from '../../src/routes/layouts/public'
import {
  COLLECTIVE_IMAGE_FALLBACK,
  type ColetivoPublico,
  type CollectivePageData,
} from '../../src/server/mappers/collectives'
import { EVENT_COVER_FALLBACK } from '../../src/server/mappers/events'
import type { Evento } from '../../src/data/types'

const coletivo = (n: number, extra: Partial<ColetivoPublico> = {}): ColetivoPublico => ({
  id: `05000000-0000-4000-8000-00000000000${n}`,
  nome: `Organização sintética ${n}`,
  tipo: 'coletivo',
  atuacao: ['Eventos Musicais', 'Artistas'],
  bio: 'Fixture sem dados reais',
  imagem: COLLECTIVE_IMAGE_FALLBACK,
  cidade: 'Recife',
  estado: 'PE',
  corPredominante: '#8b5cf6',
  social: {},
  ...extra,
})

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
  coletivoId: coletivo(1).id,
  lineup: [],
  gratuito: true,
  capa: EVENT_COVER_FALLBACK,
  ...extra,
})

const pageData = (extra: Partial<CollectivePageData> = {}): CollectivePageData => ({
  coletivo: coletivo(1, { social: { instagram: 'https://instagram.example.invalid/x', site: 'https://site.example.invalid' } }),
  membros: [{ nome: 'Pessoa A', artistaId: '02000000-0000-4000-8000-000000000001' }, { nome: 'Pessoa B' }],
  proximos: [evento(1), evento(2)],
  anteriores: [evento(3, { inicio: '2026-09-29T15:00:00.000Z' })],
  ...extra,
})

const profile = (props: CollectivePageData) =>
  render(
    <MemoryRouter>
      <CollectiveProfile {...props} />
    </MemoryRouter>,
  )

beforeEach(() => {
  vi.stubGlobal('matchMedia', vi.fn((query: string) => ({
    matches: false, media: query, addEventListener: vi.fn(), removeEventListener: vi.fn(),
  })))
})

describe('CollectivesHub', () => {
  const hub = (coletivos: ColetivoPublico[]) =>
    render(
      <MemoryRouter>
        <CollectivesHub coletivos={coletivos} />
      </MemoryRouter>,
    )

  it('lista os coletivos recebidos, na ordem recebida, com tipo, local, atuação e link para o perfil', () => {
    hub([coletivo(1), coletivo(6, { tipo: 'produtora', cidade: 'Fortaleza', estado: 'CE', atuacao: ['Serviços'] })])
    expect(screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual([
      'Organização sintética 1',
      'Organização sintética 6',
    ])
    const card = screen.getByRole('heading', { name: 'Organização sintética 6' }).closest('li')!
    expect(within(card).getByText('Produtora')).toBeTruthy()
    expect(within(card).getByText('Fortaleza/CE')).toBeTruthy()
    expect(within(card).getByText('[Serviços]')).toBeTruthy()
    expect(within(card).getByRole('link').getAttribute('href')).toBe('/coletivos/05000000-0000-4000-8000-000000000006')
    expect(within(screen.getByRole('heading', { name: 'Organização sintética 1' }).closest('li')!).getByText('Coletivo')).toBeTruthy()
  })

  it('não oferece atalhos de administrador, que dependiam do usuário simulado', () => {
    hub([coletivo(1)])
    expect(screen.queryByRole('navigation', { name: /Explorar/ })).toBeNull()
  })

  it('apresenta o estado vazio', () => {
    hub([])
    expect(screen.getByText('Nenhum coletivo ou produtora cadastrado ainda.')).toBeTruthy()
    expect(screen.queryAllByRole('heading', { level: 3 })).toHaveLength(0)
  })
})

describe('CollectiveProfile', () => {
  it('mostra nome, bio, redes, eventos e membros, com link só para membros com perfil de artista', () => {
    profile(pageData())
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Organização sintética 1')
    expect(screen.getByText('Fixture sem dados reais')).toBeTruthy()
    expect(screen.getByRole('link', { name: /Instagram/ }).getAttribute('href')).toBe('https://instagram.example.invalid/x')
    expect(screen.getByRole('link', { name: /Site/ }).getAttribute('href')).toBe('https://site.example.invalid')
    expect(screen.getByRole('link', { name: 'Pessoa A' }).getAttribute('href')).toBe('/artistas/02000000-0000-4000-8000-000000000001')
    expect(screen.getByText('Pessoa B').closest('a')).toBeNull()
    expect(screen.getByText('membros (2)')).toBeTruthy()
    expect(screen.getByRole('link', { name: /Evento sintético 1/ }).getAttribute('href')).toBe('/eventos/0a000000-0000-4000-8000-000000000001')
  })

  it('eventos do coletivo mostram a vertente principal como selo, quando existe', () => {
    profile(pageData({ proximos: [evento(1, { estilo: 'trance' }), evento(2)] }))
    expect(within(screen.getByRole('link', { name: /Evento sintético 1/ })).getByText('trance')).toBeTruthy()
    expect(within(screen.getByRole('link', { name: /Evento sintético 2/ })).queryByText('trance')).toBeNull()
  })

  it('separa próximos eventos de eventos anteriores', () => {
    profile(pageData())
    const proximos = screen.getByRole('heading', { name: 'próximos eventos' }).closest('section')!
    expect(within(proximos).getByRole('link', { name: /Evento sintético 2/ })).toBeTruthy()
    const anteriores = screen.getByRole('heading', { name: 'eventos anteriores' }).closest('section')!
    expect(within(anteriores).getByRole('link', { name: /Evento sintético 3/ })).toBeTruthy()
    expect(within(anteriores).queryByRole('link', { name: /Evento sintético 1/ })).toBeNull()
  })

  it('sem eventos, avisa que não há agenda e omite os anteriores', () => {
    profile(pageData({ proximos: [], anteriores: [] }))
    expect(screen.getByText('Sem eventos agendados.')).toBeTruthy()
    expect(screen.queryByText('eventos anteriores')).toBeNull()
  })

  it('sem membros, apresenta o estado vazio', () => {
    profile(pageData({ membros: [] }))
    expect(screen.getByText('membros (0)')).toBeTruthy()
    expect(screen.getByText('Nenhum membro para exibir.')).toBeTruthy()
  })

  it('usa a cor do coletivo como destaque', () => {
    const { container } = profile(pageData())
    expect((container.firstElementChild as HTMLElement).style.getPropertyValue('--accent')).toBeTruthy()
  })

  it('marca produtora no selo', () => {
    profile(pageData({ coletivo: coletivo(6, { tipo: 'produtora' }) }))
    expect(screen.getByText('Produtora')).toBeTruthy()
  })
})

describe('módulos de rota', () => {
  it('título vem dos dados do loader', () => {
    expect(collectivesMeta()[0]).toEqual({ title: 'Coletivos e Produtoras · CIRCUITO NE' })
    expect(collectiveMeta({ loaderData: pageData() } as never)[0]).toEqual({ title: 'Organização sintética 1 · CIRCUITO NE' })
    expect(collectiveMeta({ loaderData: undefined } as never)[0]).toEqual({ title: 'Coletivo não encontrado · CIRCUITO NE' })
  })

  const app = (path: string, child: Parameters<typeof createMemoryRouter>[0][number]) =>
    render(
      <RouterProvider
        router={createMemoryRouter(
          [{ path: '/', Component: PublicRoute, children: [child] }],
          { initialEntries: [path] },
        )}
      />,
    )

  it('renderiza o catálogo dentro do layout público a partir do loader', async () => {
    app('/coletivos', {
      path: 'coletivos',
      loader: () => ({ coletivos: [coletivo(1)] }),
      Component: () => <CollectivesRoute {...({ loaderData: useLoaderData() } as unknown as ComponentProps<typeof CollectivesRoute>)} />,
    })
    expect(await screen.findByRole('heading', { name: 'Organização sintética 1' })).toBeTruthy()
    expect(screen.getByRole('navigation', { name: 'Principal' })).toBeTruthy()
  })

  it('renderiza o perfil a partir do loader', async () => {
    app('/coletivos/x', {
      path: 'coletivos/:id',
      loader: () => pageData(),
      Component: () => <CollectiveRoute {...({ loaderData: useLoaderData() } as unknown as ComponentProps<typeof CollectiveRoute>)} />,
    })
    expect(await screen.findByRole('heading', { level: 1, name: 'Organização sintética 1' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Pessoa A' })).toBeTruthy()
  })

  it('404 do loader mostra o estado "não encontrado" dentro do layout, com caminho de volta', async () => {
    app('/coletivos/x', {
      path: 'coletivos/:id',
      loader: () => { throw data({ message: 'Coletivo não encontrado.' }, { status: 404 }) },
      Component: CollectiveRoute as never,
      ErrorBoundary: CollectiveError,
    })
    expect(await screen.findByText(/Coletivo não encontrado\./)).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Voltar' }).getAttribute('href')).toBe('/coletivos')
    expect(screen.getByRole('navigation', { name: 'Principal' })).toBeTruthy()
  })

  it('503 do loader mostra erro recuperável, não "não encontrado"', async () => {
    app('/coletivos/x', {
      path: 'coletivos/:id',
      loader: () => { throw data({ message: 'indisponível' }, { status: 503 }) },
      Component: CollectiveRoute as never,
      ErrorBoundary: CollectiveError,
    })
    expect(await screen.findByRole('alert')).toBeTruthy()
    expect(screen.queryByText(/Coletivo não encontrado\./)).toBeNull()
    expect(screen.getByText(/Tente novamente/)).toBeTruthy()
  })

  it('503 no catálogo mostra erro recuperável com volta ao início', async () => {
    app('/coletivos', {
      path: 'coletivos',
      loader: () => { throw data({ message: 'indisponível' }, { status: 503 }) },
      Component: CollectivesRoute as never,
      ErrorBoundary: CollectivesError,
    })
    expect(await screen.findByRole('alert')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'voltar ao início' }).getAttribute('href')).toBe('/')
  })
})
