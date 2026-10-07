import type { ComponentProps } from 'react'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, data, MemoryRouter, RouterProvider, useLoaderData } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ArtistProfile } from '../../src/pages/public/ArtistProfile'
import { ArtistsHub } from '../../src/pages/public/ArtistsHub'
import { Home } from '../../src/pages/public/Home'
import ArtistRoute, { ErrorBoundary as ArtistError, meta as artistMeta } from '../../src/routes/artist'
import ArtistsRoute, { meta as artistsMeta } from '../../src/routes/artists'
import HomeRoute, { ErrorBoundary as HomeError, meta as homeMeta } from '../../src/routes/home'
import PublicRoute from '../../src/routes/layouts/public'
import { ARTIST_PHOTO_FALLBACK, type ArtistPageData } from '../../src/server/mappers/artists'
import { EVENT_COVER_FALLBACK } from '../../src/server/mappers/events'
import type { HomeData } from '../../src/server/mappers/home'
import type { ArtistaPublico, ArtistaResumo, Evento } from '../../src/data/types'

const resumo = (n: number, extra: Partial<ArtistaResumo> = {}): ArtistaResumo => ({
  id: `02000000-0000-4000-8000-00000000000${n}`,
  nome: `Artista ${n}`,
  bio: `Bio do artista ${n}`,
  cidade: 'Recife',
  estado: 'PE',
  estilos: [{ estilo: 'techno', subestilo: 'melodic techno' }],
  foto: ARTIST_PHOTO_FALLBACK,
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
  coletivoId: '05000000-0000-4000-8000-000000000001',
  lineup: [],
  gratuito: true,
  capa: EVENT_COVER_FALLBACK,
  ...extra,
})

const publico = (extra: Partial<ArtistaPublico> = {}): ArtistaPublico => ({
  ...resumo(1),
  estilos: [{ estilo: 'techno', subestilo: 'melodic techno' }, { estilo: 'ambient' }],
  corPredominante: '#8b5cf6',
  fotos: [],
  social: { instagram: 'https://instagram.example.invalid/a', site: 'https://site.example.invalid' },
  ...extra,
})

const pageData = (extra: Partial<ArtistPageData> = {}): ArtistPageData => ({
  artista: publico(),
  proximos: [evento(1)],
  anteriores: [evento(3)],
  ...extra,
})

const homeData = (extra: Partial<HomeData> = {}): HomeData => ({
  proximos: [evento(2), evento(1, { gratuito: false })],
  artistas: [resumo(1), resumo(2, { estilos: [] })],
  coletivos: [
    { id: '05000000-0000-4000-8000-000000000001', nome: 'Organização 1', tipo: 'coletivo', cidade: 'Recife', estado: 'PE' },
    { id: '05000000-0000-4000-8000-000000000006', nome: 'Organização 6', tipo: 'produtora', cidade: 'Natal', estado: 'RN' },
  ],
  totais: { artistas: 12, coletivos: 5, eventos: 9 },
  ...extra,
})

beforeEach(() => {
  vi.stubGlobal('matchMedia', vi.fn((query: string) => ({
    matches: false, media: query,
    addEventListener: vi.fn(), removeEventListener: vi.fn(),
  })))
})

describe('ArtistsHub', () => {
  const hub = (artistas: ArtistaResumo[]) =>
    render(
      <MemoryRouter>
        <ArtistsHub artistas={artistas} />
      </MemoryRouter>,
    )
  const names = () => screen.queryAllByRole('heading', { level: 3 }).map((h) => h.textContent)
  const lista = [
    resumo(1, { nome: 'ANERIE', bio: 'Produtora recifense', estilos: [{ estilo: 'techno', subestilo: 'hypnotic techno' }, { estilo: 'ambient' }] }),
    resumo(2, { nome: 'BOITATÁ', bio: 'Sound system cearense', cidade: 'Fortaleza', estado: 'CE', estilos: [{ estilo: 'reggae', subestilo: 'dub' }] }),
    resumo(3, { nome: 'SEM ESTILO', bio: 'Sem classificação', estilos: [] }),
  ]

  it('mostra cada artista com link, cidade/UF e estilos canônicos, na ordem recebida', () => {
    hub(lista)
    expect(names()).toEqual(['ANERIE', 'BOITATÁ', 'SEM ESTILO'])
    expect(screen.getByRole('link', { name: 'ANERIE' }).getAttribute('href')).toBe('/artistas/02000000-0000-4000-8000-000000000001')
    expect(screen.getByRole('link', { name: 'Foto de ANERIE' }).getAttribute('href')).toBe('/artistas/02000000-0000-4000-8000-000000000001')
    const card = screen.getByRole('heading', { name: 'ANERIE' }).closest('article')!
    expect(within(card).getByText('#hypnotictechno')).toBeTruthy()
    expect(within(card).getByText('#ambient')).toBeTruthy()
    expect(within(card).getByText('Recife/PE')).toBeTruthy()
    expect(card.querySelector('img')?.getAttribute('src')).toBe(ARTIST_PHOTO_FALLBACK)
  })

  it('não apresenta dados restritos (booking, cachê, presskit) nem "próximo evento" inventado', () => {
    hub(lista)
    expect(screen.queryByText(/booking|cachê|presskit|próximo:/i)).toBeNull()
    expect(screen.queryByRole('link', { name: /Instagram|SoundCloud/ })).toBeNull()
  })

  it('oferece como filtro os estilos principais e inclui os subestilos', async () => {
    const user = userEvent.setup()
    hub(lista)
    const filtros = within(screen.getByRole('group', { name: 'Filtrar por estilo' }))
    expect(filtros.getAllByRole('button').map((b) => b.textContent)).toEqual(['todos', 'ambient', 'reggae', 'techno'])
    await user.click(filtros.getByRole('button', { name: 'techno' }))
    expect(names()).toEqual(['ANERIE'])
    await user.click(filtros.getByRole('button', { name: 'reggae' }))
    expect(names()).toEqual(['BOITATÁ'])
    await user.click(filtros.getByRole('button', { name: 'reggae' }))
    expect(names()).toHaveLength(3)
  })

  it('combina busca (nome e bio) com estilo e recupera a lista vazia', async () => {
    const user = userEvent.setup()
    hub(lista)
    const search = screen.getByRole('searchbox', { name: 'Buscar' })
    await user.type(search, 'recifense')
    expect(names()).toEqual(['ANERIE'])
    await user.click(screen.getByRole('button', { name: 'reggae' }))
    expect(screen.getByText('Nenhum artista encontrado para os filtros atuais.')).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'todos' }))
    await user.clear(search)
    await user.type(search, 'SOUND')
    expect(names()).toEqual(['BOITATÁ'])
  })

  it('apresenta estado vazio quando não há artistas publicados', () => {
    hub([])
    expect(screen.getByText('Nenhum artista publicado ainda.')).toBeTruthy()
  })
})

describe('ArtistProfile', () => {
  const profile = (props: ArtistPageData) =>
    render(
      <MemoryRouter>
        <ArtistProfile {...props} />
      </MemoryRouter>,
    )

  it('mostra nome, cidade, estilos, bio, redes e eventos com links', () => {
    const { container } = profile(pageData())
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Artista 1')
    expect(screen.getByText('Recife/PE')).toBeTruthy()
    expect(screen.getByText('melodic techno')).toBeTruthy()
    expect(screen.getByText('ambient')).toBeTruthy()
    expect(screen.getByText('Bio do artista 1')).toBeTruthy()
    expect(screen.getByRole('link', { name: /Instagram/ }).getAttribute('href')).toBe('https://instagram.example.invalid/a')
    expect(screen.getByRole('link', { name: /Site/ }).getAttribute('href')).toBe('https://site.example.invalid')
    expect(screen.getByRole('link', { name: /Evento sintético 1/ }).getAttribute('href')).toBe('/eventos/0a000000-0000-4000-8000-000000000001')
    expect(screen.getByRole('heading', { name: 'eventos anteriores' })).toBeTruthy()
    expect(screen.getByRole('link', { name: /Evento sintético 3/ })).toBeTruthy()
    expect(screen.getByRole('link', { name: '← artistas/' }).getAttribute('href')).toBe('/artistas')
    expect(screen.getByRole('img', { name: 'Foto de apresentação de Artista 1' }).getAttribute('src')).toBe(ARTIST_PHOTO_FALLBACK)
    expect((container.firstElementChild as HTMLElement).style.getPropertyValue('--accent')).toBeTruthy()
  })

  it('não mostra contato de booking, cachê, presskit nem galeria', () => {
    profile(pageData())
    expect(screen.queryByText(/booking|cachê|presskit|mailto/i)).toBeNull()
    expect(screen.queryByRole('heading', { name: 'galeria' })).toBeNull()
  })

  it('sem eventos mostra o estado vazio e omite os anteriores; sem cor usa o destaque padrão', () => {
    const { container } = profile(pageData({ proximos: [], anteriores: [], artista: publico({ corPredominante: undefined, bio: '', social: {} }) }))
    expect(screen.getByText('Nenhum evento agendado no momento.')).toBeTruthy()
    expect(screen.queryByRole('heading', { name: 'eventos anteriores' })).toBeNull()
    expect((container.firstElementChild as HTMLElement).style.getPropertyValue('--accent')).toBeTruthy()
    expect(screen.queryByRole('link', { name: /Instagram/ })).toBeNull()
  })
})

describe('Home', () => {
  const home = (props: HomeData) =>
    render(
      <MemoryRouter>
        <Home {...props} />
      </MemoryRouter>,
    )

  it('usa um título principal e títulos de seção, com os totais do banco', async () => {
    home(homeData())
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
    for (const name of ['eventos.log', 'artistas/', 'coletivos/']) expect(screen.getByRole('heading', { level: 2, name })).toBeTruthy()
    // O painel de boot revela uma linha por vez (animação da página inicial).
    for (const line of ['artistas conectados: 12', 'coletivos/produtoras: 5', 'eventos programados: 9'])
      expect(await screen.findByText(line, {}, { timeout: 3000 })).toBeTruthy()
  })

  it('com movimento reduzido mostra o painel de boot completo de uma vez', () => {
    vi.stubGlobal('matchMedia', vi.fn((query: string) => ({
      matches: query === '(prefers-reduced-motion: reduce)', media: query,
      addEventListener: vi.fn(), removeEventListener: vi.fn(),
    })))
    home(homeData())
    expect(screen.getByText('artistas conectados: 12')).toBeTruthy()
    expect(screen.getByText('status: online ✓')).toBeTruthy()
  })

  it('lista eventos, artistas e coletivos com links para os detalhes', () => {
    home(homeData())
    expect(screen.getByRole('link', { name: /Evento sintético 2/ }).getAttribute('href')).toBe('/eventos/0a000000-0000-4000-8000-000000000002')
    expect(screen.getByRole('link', { name: /Artista 1/ }).getAttribute('href')).toBe('/artistas/02000000-0000-4000-8000-000000000001')
    expect(screen.getByText('melodic techno')).toBeTruthy()
    expect(screen.getByRole('link', { name: /Organização 6/ }).getAttribute('href')).toBe('/coletivos/05000000-0000-4000-8000-000000000006')
    expect(screen.getByText('Produtora')).toBeTruthy()
    expect(screen.getByText('Coletivo')).toBeTruthy()
    expect(screen.getByText('Gratuito')).toBeTruthy()
  })

  it('mostra estados vazios sem seções de coletivos quando não há dados', () => {
    home(homeData({ proximos: [], artistas: [], coletivos: [], totais: { artistas: 0, coletivos: 0, eventos: 0 } }))
    expect(screen.getByText('Nenhum evento programado no momento.')).toBeTruthy()
    expect(screen.getByText('Nenhum artista publicado ainda.')).toBeTruthy()
    expect(screen.queryByRole('heading', { level: 2, name: 'coletivos/' })).toBeNull()
  })
})

describe('módulos de rota', () => {
  it('títulos vêm dos dados do loader', () => {
    expect(homeMeta()[0]).toEqual({ title: 'Início · CIRCUITO NE' })
    expect(artistsMeta()[0]).toEqual({ title: 'Artistas · CIRCUITO NE' })
    expect(artistMeta({ loaderData: pageData() } as never)[0]).toEqual({ title: 'Artista 1 · CIRCUITO NE' })
    expect(artistMeta({ loaderData: undefined } as never)[0]).toEqual({ title: 'Artista não encontrado · CIRCUITO NE' })
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
  const withData = <T,>(Route: (props: T) => React.ReactNode) => () =>
    Route({ loaderData: useLoaderData() } as unknown as T)

  it('renderiza a home dentro do layout público a partir do loader', async () => {
    app('/', {
      index: true,
      loader: () => homeData(),
      Component: withData<ComponentProps<typeof HomeRoute>>(HomeRoute),
    })
    expect(await screen.findByRole('heading', { level: 1 })).toBeTruthy()
    expect(screen.getByRole('navigation', { name: 'Principal' })).toBeTruthy()
    expect(await screen.findByText('artistas conectados: 12', {}, { timeout: 3000 })).toBeTruthy()
  })

  it('home com 503 mostra erro recuperável com caminho para tentar de novo', async () => {
    app('/', {
      index: true,
      loader: () => { throw data({ message: 'indisponível' }, { status: 503 }) },
      Component: HomeRoute as never,
      ErrorBoundary: HomeError,
    })
    expect(await screen.findByRole('alert')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'tentar novamente' }).getAttribute('href')).toBe('/')
  })

  it('renderiza o hub dentro do layout público a partir do loader', async () => {
    app('/artistas', {
      path: 'artistas',
      loader: () => ({ artistas: [resumo(1), resumo(2)] }),
      Component: withData<ComponentProps<typeof ArtistsRoute>>(ArtistsRoute),
    })
    expect(await screen.findByRole('heading', { name: 'Artista 2' })).toBeTruthy()
    expect(screen.getByRole('navigation', { name: 'Principal' })).toBeTruthy()
  })

  it('404 do loader mostra "artista não encontrado" dentro do layout, com caminho de volta', async () => {
    app('/artistas/x', {
      path: 'artistas/:id',
      loader: () => { throw data({ message: 'Artista não encontrado.' }, { status: 404 }) },
      Component: ArtistRoute as never,
      ErrorBoundary: ArtistError,
    })
    expect(await screen.findByText(/Artista não encontrado\./)).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Voltar ao hub' }).getAttribute('href')).toBe('/artistas')
    expect(screen.getByRole('navigation', { name: 'Principal' })).toBeTruthy()
  })

  it('503 do loader mostra erro recuperável, não "não encontrado"', async () => {
    app('/artistas/x', {
      path: 'artistas/:id',
      loader: () => { throw data({ message: 'indisponível' }, { status: 503 }) },
      Component: ArtistRoute as never,
      ErrorBoundary: ArtistError,
    })
    expect(await screen.findByRole('alert')).toBeTruthy()
    expect(screen.queryByText(/Artista não encontrado\./)).toBeNull()
    expect(screen.getByText(/Tente novamente/)).toBeTruthy()
  })

  it('renderiza o perfil a partir do loader', async () => {
    app('/artistas/x', {
      path: 'artistas/:id',
      loader: () => pageData(),
      Component: withData<ComponentProps<typeof ArtistRoute>>(ArtistRoute),
    })
    expect(await screen.findByRole('heading', { level: 1, name: 'Artista 1' })).toBeTruthy()
  })
})
