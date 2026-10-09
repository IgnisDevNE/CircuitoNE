import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, MemoryRouter, RouterProvider, useLoaderData } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AppShell } from '../../src/components/layout/AppShell'
import { Dashboard } from '../../src/pages/app/Dashboard'
import { RestrictedAccount } from '../../src/pages/app/RestrictedAccount'
import AppRoute from '../../src/routes/layouts/app'
import PublicRoute from '../../src/routes/layouts/public'
import DashboardRoute, { meta as dashboardMeta } from '../../src/routes/dashboard'
import { EVENT_COVER_FALLBACK } from '../../src/server/mappers/events'
import type { AppLayoutData } from '../../src/server/account.server'
import type { MeuColetivo, MeuPerfil, ProximoEvento } from '../../src/server/mappers/account'

const perfil = (extra: Partial<MeuPerfil> = {}): MeuPerfil => ({
  id: '02000000-0000-4000-8000-000000000001', tipo: 'artista', nome: 'Artista sintético público',
  cidade: 'Recife', estado: 'PE', publicado: true, padrao: true, ...extra,
})
const coletivo = (extra: Partial<MeuColetivo> = {}): MeuColetivo => ({
  id: '05000000-0000-4000-8000-000000000001', nome: 'Organização sintética 1', tipo: 'coletivo', cidade: 'Recife',
  estado: 'PE', situacao: 'approved', cargo: 'Membro', dono: true, ...extra,
})
const proximo = (n: number, como = ['Artista sintético público']): ProximoEvento => ({
  como,
  evento: {
    id: `0a000000-0000-4000-8000-00000000000${n}`, nome: `Evento sintético ${n}`, tipo: 'festa', descricao: '',
    inicio: '2026-10-07T15:00:00.000Z', fim: null, estado: 'PE', cidade: 'Recife', local: 'Local sintético',
    coletivoId: '05000000-0000-4000-8000-000000000001', lineup: [], gratuito: true, capa: EVENT_COVER_FALLBACK,
  },
})

const shell = (props: Partial<Parameters<typeof AppShell>[0]> = {}) =>
  render(
    <MemoryRouter initialEntries={['/painel']}>
      <AppShell nome="Pessoa A sintética" perfis={[perfil()]} coletivos={[coletivo()]} naoLidas={0} {...props}>
        <p>conteúdo</p>
      </AppShell>
    </MemoryRouter>,
  )
const navLinks = () => within(screen.getByRole('navigation', { name: 'Painel' })).getAllByRole('link').map((a) => [a.textContent, a.getAttribute('href')])

beforeEach(() => {
  vi.stubGlobal('matchMedia', vi.fn((query: string) => ({
    matches: false, media: query, addEventListener: vi.fn(), removeEventListener: vi.fn(),
  })))
})

describe('AppShell com dados reais por props (sem StoreProvider)', () => {
  it('mostra a conta e o menu da conta, sem dados de mentira', () => {
    shell({ perfis: [perfil(), perfil({ id: 'svc', tipo: 'servicos', nome: 'Serviços sintéticos', publicado: false })], naoLidas: 3 })
    expect(screen.getByText('Pessoa A sintética')).toBeTruthy()
    expect(screen.getByText('Artista + Serviços')).toBeTruthy()
    expect(screen.getByText('conteúdo')).toBeTruthy()
    expect(navLinks()).toEqual([
      ['Início (site)', '/'],
      ['Dashboard', '/painel'],
      ['Perfil · Artista sintético público', '/painel/perfil/02000000-0000-4000-8000-000000000001'],
      ['Editar Dados', '/painel/dados'],
      ['Segurança', '/painel/seguranca'],
      ['Mensagens (3)', '/painel/mensagens'],
      ['Coletivos/Produtoras', '/painel/coletivos'],
      ['Explorar Artistas', '/painel/explorar/artistas'],
      ['Explorar Serviços', '/painel/explorar/servicos'],
      ['Explorar Audiovisual', '/painel/explorar/audiovisual'],
      ['Explorar Coletivos', '/painel/explorar/coletivos'],
    ])
  })

  it('sem coletivos nem perfis de artista o menu fica enxuto, e sem não lidas o rótulo não tem contador', () => {
    shell({ perfis: [perfil({ tipo: 'servicos', nome: 'Serviços sintéticos' })], coletivos: [] })
    expect(navLinks().map(([label]) => label)).toEqual([
      'Início (site)', 'Dashboard', 'Editar Dados', 'Segurança', 'Mensagens',
      'Explorar Artistas', 'Explorar Serviços', 'Explorar Audiovisual', 'Explorar Coletivos',
    ])
  })

  it('toda conta ativa vê "Explorar" (RN-06): membro comum ou coletivo em análise também; os dados restritos dependem do banco', () => {
    shell({ coletivos: [coletivo({ dono: false }), coletivo({ id: 'p', situacao: 'pending' })] })
    expect(navLinks().map(([label]) => label)).toContain('Coletivos/Produtoras')
    expect(navLinks().filter(([label]) => label?.startsWith('Explorar')).map(([, href]) => href)).toEqual([
      '/painel/explorar/artistas', '/painel/explorar/servicos', '/painel/explorar/audiovisual', '/painel/explorar/coletivos',
    ])
  })

  it('o menu recolhido abre pelo botão e fecha com Esc', async () => {
    shell()
    const user = userEvent.setup()
    const toggle = screen.getByRole('button', { name: 'Menu do painel' })
    expect(toggle.getAttribute('aria-expanded')).toBe('false')
    await user.click(toggle)
    expect(toggle.getAttribute('aria-expanded')).toBe('true')
    await user.keyboard('{Escape}')
    expect(toggle.getAttribute('aria-expanded')).toBe('false')
  })

  it('"Sair" é o formulário real POST /sair', () => {
    shell()
    const button = screen.getByRole('button', { name: '[→] Sair da sessão' })
    expect(button.closest('form')?.getAttribute('method')).toBe('post')
    expect(button.closest('form')?.getAttribute('action')).toBe('/sair')
  })

})

describe('Dashboard real', () => {
  const dash = (props: Partial<Parameters<typeof Dashboard>[0]> = {}) =>
    render(
      <MemoryRouter>
        <Dashboard nome="Pessoa A sintética" perfis={[perfil()]} coletivos={[coletivo()]} naoLidas={0} proximos={[]} {...props} />
      </MemoryRouter>,
    )

  it('mostra nome, atuações com situação de publicação, coletivos com cargo, eventos e não lidas', () => {
    dash({
      perfis: [perfil(), perfil({ id: 'b', nome: 'Projeto sintético interno', publicado: false }), perfil({ id: 'c', tipo: 'servicos', nome: 'Serviços sintéticos', publicado: false })],
      coletivos: [coletivo(), coletivo({ id: 'p', nome: 'Produtora em análise', tipo: 'produtora', situacao: 'pending', dono: false, cargo: 'Operações' })],
      naoLidas: 3,
      proximos: [proximo(1), proximo(2, ['A', 'B'])],
    })
    expect(screen.getByRole('heading', { level: 1 }).textContent).toContain('olá, Pessoa')
    const atuacoes = screen.getByText('atuações ativas').nextElementSibling as HTMLElement
    expect(within(atuacoes).getAllByRole('listitem')).toHaveLength(3)
    expect(within(atuacoes).getByText('— Artista sintético público').closest('li')!.textContent).toContain('perfil público')
    expect(within(atuacoes).getByText('— Projeto sintético interno').closest('li')!.textContent).toContain('não publicado')
    expect(within(atuacoes).getByText('— Serviços sintéticos').closest('li')!.textContent).not.toMatch(/público|publicado/)

    const meus = screen.getByRole('heading', { name: 'meus coletivos' }).closest('section')!
    expect(within(meus).getByRole('link', { name: 'Organização sintética 1' }).getAttribute('href')).toBe('/coletivo/05000000-0000-4000-8000-000000000001/painel')
    expect(within(meus).getByText('Membro · responsável')).toBeTruthy()
    expect(within(meus).queryByRole('link', { name: 'Produtora em análise' })).toBeNull()
    expect(within(meus).getByText('Operações')).toBeTruthy()
    expect(within(meus).getByText('em análise')).toBeTruthy()

    expect(screen.getByRole('status').textContent).toBe('3 mensagens não lidas.')
    const eventos = screen.getByRole('heading', { name: 'próximos eventos' }).closest('section')!
    expect(within(eventos).getByRole('link', { name: /Evento sintético 1/ }).getAttribute('href')).toBe('/eventos/0a000000-0000-4000-8000-000000000001')
    expect(within(eventos).getByText('como A, B')).toBeTruthy()
  })

  it('estados vazios dizem a verdade, sem dados inventados', () => {
    dash({ perfis: [], coletivos: [], proximos: [] })
    expect(screen.getByText('Nenhuma atuação cadastrada.')).toBeTruthy()
    expect(screen.getByText('Você ainda não participa de coletivos.')).toBeTruthy()
    // Sem coletivo: criar um ou pedir para entrar em um existente.
    const meus = screen.getByRole('heading', { name: 'meus coletivos' }).closest('section')!
    expect(within(meus).getByRole('link', { name: 'criar um coletivo' }).getAttribute('href')).toBe('/painel/coletivos/novo')
    expect(within(meus).getByRole('link', { name: 'pedir para entrar' }).getAttribute('href')).toBe('/painel/coletivos#solicitar-acesso')
    expect(screen.getByText('Nenhum evento com as suas atuações na line-up.')).toBeTruthy()
    expect(screen.getByRole('status').textContent).toBe('Nenhuma mensagem não lida.')
  })

  it('com coletivos, o painel não oferece criar nem pedir entrada (isso fica em "meus coletivos")', () => {
    dash()
    expect(screen.queryByRole('link', { name: 'criar um coletivo' })).toBeNull()
    expect(screen.queryByRole('link', { name: 'pedir para entrar' })).toBeNull()
  })

  it('singular de mensagens', () => {
    dash({ naoLidas: 1 })
    expect(screen.getByRole('status').textContent).toBe('1 mensagem não lida.')
  })
})

describe('RestrictedAccount', () => {
  const restricted = (situacao: Parameters<typeof RestrictedAccount>[0]['situacao'], motivo: string | null = null, nome: string | null = 'Pessoa A sintética') =>
    render(<RestrictedAccount nome={nome} situacao={situacao} motivo={motivo} />)

  it.each([
    ['suspended', 'Revisão sintética', /Conta suspensa para revisão/],
    ['deletion_pending', null, /exclusão da sua conta está em análise/],
    ['incomplete', null, /cadastro ou a confirmação dos contatos/],
  ] as const)('%s: mensagem, suporte e saída por POST, sem menus', (situacao, motivo, message) => {
    restricted(situacao, motivo)
    expect(screen.getByText(message)).toBeTruthy()
    if (motivo) expect(screen.getByText(motivo)).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Contatar suporte' }).getAttribute('href')).toBe('mailto:ignisdev@magalz.space')
    const sair = screen.getByRole('button', { name: 'Sair' })
    expect(sair.closest('form')?.getAttribute('method')).toBe('post')
    expect(sair.closest('form')?.getAttribute('action')).toBe('/sair')
    expect(screen.queryByRole('navigation')).toBeNull()
  })

  it('conta sem nome usa o título genérico', () => {
    restricted('incomplete', null, null)
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Minha conta')
  })
})

describe('módulos de rota autenticados', () => {
  const active: AppLayoutData = {
    status: 'active', nome: 'Pessoa A sintética', perfis: [perfil()], coletivos: [coletivo()], naoLidas: 2,
  }
  // Em produção o framework injeta `loaderData`; no teste vem do loader da rota em memória.
  const withData = (Route: unknown) => () => {
    const Component = Route as (props: { loaderData: unknown }) => React.ReactNode
    return <Component loaderData={useLoaderData()} />
  }
  const app = (layout: AppLayoutData, path = '/painel') =>
    render(
      <RouterProvider
        router={createMemoryRouter(
          [
            {
              id: 'routes/layouts/app', Component: withData(AppRoute), loader: () => layout,
              children: [
                { path: 'painel', loader: () => ({ proximos: [proximo(1)] }), Component: withData(DashboardRoute) },
                { path: 'painel/mensagens', Component: () => <p>mensagens</p> },
              ],
            },
          ],
          { initialEntries: [path] },
        )}
      />,
    )

  it('conta ativa: layout com menu real e dashboard com dados do layout e do loader', async () => {
    app(active)
    expect(await screen.findByRole('heading', { level: 1, name: /olá, Pessoa/ })).toBeTruthy()
    expect(screen.getByRole('navigation', { name: 'Painel' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Mensagens (2)' })).toBeTruthy()
    expect(screen.getByRole('link', { name: /Evento sintético 1/ })).toBeTruthy()
    expect(screen.getByText('— Artista sintético público')).toBeTruthy()
  })


  it('conta suspensa: só o aviso restrito, sem menu nem conteúdo do painel', async () => {
    app({ status: 'restricted', nome: 'Pessoa A sintética', situacao: 'suspended', motivo: 'Revisão sintética' })
    expect(await screen.findByText('Revisão sintética')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Contatar suporte' })).toBeTruthy()
    expect(screen.queryByRole('navigation')).toBeNull()
    expect(screen.queryByText(/olá,/)).toBeNull()
  })

  it('títulos das rotas', () => {
    expect(dashboardMeta()[0]).toEqual({ title: 'Dashboard · CIRCUITO NE' })
  })
})

describe('cabeçalho público conforme a sessão do servidor', () => {
  const header = (session?: { signedIn: boolean; name: string | null }) =>
    render(
      <RouterProvider
        router={createMemoryRouter(
          [{ Component: PublicRoute, ...(session ? { loader: () => session } : {}), children: [{ index: true, Component: () => <p>página</p> }] }],
          { initialEntries: ['/'] },
        )}
      />,
    )
  const principal = async () => within(await screen.findByRole('navigation', { name: 'Principal' }))

  it('sessão válida: "Painel" no lugar de "Entrar"', async () => {
    header({ signedIn: true, name: 'Pessoa A sintética' })
    const nav = await principal()
    expect(nav.getByRole('link', { name: 'Painel' }).getAttribute('href')).toBe('/painel')
    expect(nav.queryByRole('link', { name: 'Entrar' })).toBeNull()
  })

  it('visitante: "Entrar"', async () => {
    header({ signedIn: false, name: null })
    const nav = await principal()
    expect(nav.getByRole('link', { name: 'Entrar' }).getAttribute('href')).toBe('/entrar')
    expect(nav.queryByRole('link', { name: 'Painel' })).toBeNull()
  })

  it('o menu móvel lista links reais e fecha com Esc', async () => {
    header({ signedIn: false, name: null })
    const user = userEvent.setup()
    const toggle = await screen.findByRole('button', { name: 'Abrir menu' })
    await user.click(toggle)
    const mobile = within(screen.getByRole('navigation', { name: 'Principal (móvel)' }))
    expect(mobile.getAllByRole('link').map((link) => link.getAttribute('href'))).toEqual(['/artistas', '/coletivos', '/eventos', '/manifesto', '/entrar'])
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('navigation', { name: 'Principal (móvel)' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Abrir menu' }).getAttribute('aria-expanded')).toBe('false')
  })

  it('sem loader de sessão (testes de componente) também é visitante', async () => {
    header()
    expect((await principal()).getByRole('link', { name: 'Entrar' })).toBeTruthy()
  })
})
