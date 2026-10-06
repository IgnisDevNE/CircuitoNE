import type { ComponentProps } from 'react'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, data, Outlet, RouterProvider, useActionData, useLoaderData } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CollectiveLayout } from '../../src/components/layout/CollectiveLayout'
import { MyCollectives } from '../../src/pages/app/MyCollectives'
import { CollectiveDashboard } from '../../src/pages/collective/CollectiveDashboard'
import { CollectiveUnavailable } from '../../src/pages/collective/CollectiveUnavailable'
import { PendingRequests } from '../../src/pages/collective/PendingRequests'
import CollectiveDashboardRoute, { ErrorBoundary as DashboardError } from '../../src/routes/collective-dashboard'
import CollectiveRequestsRoute from '../../src/routes/collective-requests'
import CollectiveAreaRoute, { ErrorBoundary as AreaError, meta as areaMeta } from '../../src/routes/layouts/collective'
import MyCollectivesRoute from '../../src/routes/my-collectives'
import type { ActionResult } from '../../src/lib/action-result'
import type { CollectiveAreaData, EventoGestao, PedidoEntrada } from '../../src/server/mappers/collective-area'

const C = '05000000-0000-4000-8000-000000000001'
const coletivo = { id: C, nome: 'Organização sintética 1', tipo: 'coletivo' as const, cidade: 'Recife', estado: 'PE' as const, cargo: 'Membro', dono: false, cor: '#8b5cf6' }

const evento = (n: number, extra: Partial<EventoGestao> = {}): EventoGestao => ({
  id: `0a000000-0000-4000-8000-00000000000${n}`, nome: `Evento sintético ${n}`, situacao: 'published', periodo: 'future',
  inicio: '2026-10-08T15:00:00.000Z', fim: null, ...extra,
})
const pedido = (n: number, extra: Partial<PedidoEntrada> = {}): PedidoEntrada => ({
  id: `09000000-0000-4000-8000-00000000000${n}`, criadoEm: '2026-10-07T12:00:00.000Z', mensagem: '', nome: `Pessoa ${n}`, atuacao: null, ...extra,
})

beforeEach(() => {
  vi.stubGlobal('matchMedia', vi.fn((query: string) => ({ matches: false, media: query, addEventListener: vi.fn(), removeEventListener: vi.fn() })))
})

// Formulários do React Router (`Form`) exigem um data router.
const inRouter = (ui: React.ReactElement) =>
  render(<RouterProvider router={createMemoryRouter([{ path: '*', element: ui }], { initialEntries: ['/'] })} />)

/** Entrega ao módulo de rota os mesmos `loaderData`/`actionData` que o framework entrega. */
const withLoader = <P,>(Route: (props: P) => React.ReactNode) =>
  function Wrapped() {
    return Route({ loaderData: useLoaderData(), actionData: useActionData() } as unknown as P)
  }
const sectionNav = () => within(screen.getByRole('navigation', { name: 'Seções do coletivo' }))
const links = () => sectionNav().getAllByRole('link').map((a) => [a.textContent, a.getAttribute('href')])

describe('CollectiveLayout', () => {
  const layout = (props: Partial<ComponentProps<typeof CollectiveLayout>> = {}) =>
    inRouter(
      <CollectiveLayout coletivo={coletivo} permissoes={[]} {...props}>
        <p>conteúdo</p>
      </CollectiveLayout>,
    )

  it('Membro sem permissões: só o dashboard, com o cargo e sem "nível"', () => {
    layout()
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Organização sintética 1')
    expect(screen.getByText('Membro')).toBeTruthy()
    expect(screen.queryByText(/nível/)).toBeNull()
    expect(links()).toEqual([['Dashboard', `/coletivo/${C}/painel`]])
    expect(screen.getByText('conteúdo')).toBeTruthy()
    expect(screen.getByRole('link', { name: '← meus coletivos' }).getAttribute('href')).toBe('/painel/coletivos')
  })

  it('o menu segue as permissões e mostra pedidos pendentes', () => {
    layout({ coletivo: { ...coletivo, cargo: 'Operações sintéticas' }, permissoes: ['manage_requests', 'read_messages', 'create_events'], pendentes: 2 })
    expect(links()).toEqual([
      ['Dashboard', `/coletivo/${C}/painel`],
      ['Mensagens', `/coletivo/${C}/mensagens`],
      ['Solicitações (2)', `/coletivo/${C}/solicitacoes`],
      ['Criar Evento', `/coletivo/${C}/eventos/novo`],
    ])
  })

  it('o proprietário vê todas as seções e é marcado como responsável', () => {
    layout({ coletivo: { ...coletivo, dono: true }, permissoes: ['manage_requests', 'remove_members', 'create_events', 'edit_events', 'publish_events', 'cancel_events', 'read_messages', 'send_messages'] })
    expect(links().map(([label]) => label)).toEqual(['Dashboard', 'Mensagens', 'Solicitações', 'Criar Evento', 'Membros', 'Editar', 'Perfil Público'])
    expect(screen.getByText('Membro · responsável')).toBeTruthy()
  })

  it('usa a cor do coletivo como destaque', () => {
    const { container } = layout()
    expect((container.firstElementChild as HTMLElement).style.getPropertyValue('--accent')).toBeTruthy()
  })
})

describe('CollectiveUnavailable', () => {
  const unavailable = (situacao: ComponentProps<typeof CollectiveUnavailable>['situacao'], motivo: string | null = null, dono = true) =>
    inRouter(<CollectiveUnavailable coletivo={{ nome: 'Organização sintética 2', cargo: 'Membro', dono }} situacao={situacao} motivo={motivo} />)

  it('em análise: explica que as funções internas só chegam com a aprovação e não oferece menu', () => {
    unavailable('pending')
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Organização sintética 2')
    expect(screen.getByText('em análise')).toBeTruthy()
    expect(screen.getByRole('status').textContent).toMatch(/somente depois da aprovação/)
    expect(screen.queryByRole('navigation', { name: 'Seções do coletivo' })).toBeNull()
    expect(screen.getAllByRole('link').every((a) => a.getAttribute('href') === '/painel/coletivos')).toBe(true)
  })

  it('recusado mostra o motivo informado; suspenso explica o bloqueio', () => {
    unavailable('rejected', 'Sem contato com o responsável')
    expect(screen.getByText('recusado')).toBeTruthy()
    expect(screen.getByText('Motivo informado: Sem contato com o responsável')).toBeTruthy()
  })

  it('suspenso explica o bloqueio e não inventa motivo', () => {
    unavailable('suspended', null, false)
    expect(screen.getByText('suspenso')).toBeTruthy()
    expect(screen.getByRole('status').textContent).toMatch(/indisponíveis até uma eventual reativação/)
    expect(screen.queryByText(/Motivo informado/)).toBeNull()
  })
})

describe('CollectiveDashboard', () => {
  const dashboard = (props: Partial<ComponentProps<typeof CollectiveDashboard>> = {}) =>
    inRouter(
      <CollectiveDashboard coletivo={coletivo} permissoes={[]} pendentes={null} eventos={[]} gestao={false} mensagens={null} {...props} />,
    )

  it('Membro sem permissões: eventos publicados, aviso de escopo, e nenhum painel de pedidos ou mensagens', () => {
    dashboard({ eventos: [evento(1)] })
    expect(screen.getByRole('link', { name: /Evento sintético 1/ }).getAttribute('href')).toBe('/eventos/0a000000-0000-4000-8000-000000000001')
    expect(screen.getByText(/aparecem só os eventos publicados/)).toBeTruthy()
    expect(screen.queryByText('solicitações de entrada')).toBeNull()
    expect(screen.queryByText('mensagens do coletivo')).toBeNull()
    const atalhos = screen.getByRole('heading', { name: 'atalhos' }).closest('section')!
    expect(within(atalhos).getAllByRole('link').map((a) => a.getAttribute('href'))).toEqual([`/coletivos/${C}`])
  })

  it('gestão mostra rascunhos, cancelados, em andamento e encerrados com a situação de cada um', () => {
    dashboard({
      gestao: true,
      permissoes: ['create_events'],
      eventos: [
        evento(1, { periodo: 'ongoing' }),
        evento(2, { situacao: 'draft' }),
        evento(3, { situacao: 'cancelled' }),
        evento(4, { periodo: 'past' }),
      ],
    })
    const item = (n: number) => screen.getByRole('link', { name: new RegExp(`Evento sintético ${n}`) })
    expect(item(1).textContent).toContain('em andamento')
    expect(item(2).textContent).toContain('rascunho')
    expect(item(3).textContent).toContain('cancelado')
    expect(item(4).textContent).toContain('encerrado')
    expect(screen.queryByText(/aparecem só os eventos publicados/)).toBeNull()
  })

  it('estados vazios dizem a verdade', () => {
    dashboard({ gestao: true })
    expect(screen.getByText('Nenhum evento cadastrado.')).toBeTruthy()
  })

  it('pedidos pendentes e mensagens só aparecem com a permissão correspondente', () => {
    dashboard({ permissoes: ['manage_requests', 'read_messages'], pendentes: 3, mensagens: { conversas: 2, naoLidas: 1 } })
    const pedidos = screen.getByRole('heading', { name: 'solicitações de entrada' }).closest('section')!
    expect(within(pedidos).getByRole('status').textContent).toBe('3 pedidos pendentes.')
    expect(within(pedidos).getByRole('link', { name: /ver solicitações/ }).getAttribute('href')).toBe(`/coletivo/${C}/solicitacoes`)
    const chat = screen.getByRole('heading', { name: 'mensagens do coletivo' }).closest('section')!
    expect(chat.textContent).toContain('1 mensagem não lida em 2 conversas.')
    expect(within(chat).getByRole('link').getAttribute('href')).toBe(`/coletivo/${C}/mensagens`)
  })

  it('nenhum pedido pendente e singular', () => {
    dashboard({ permissoes: ['manage_requests'], pendentes: 0 })
    expect(screen.getByText('Nenhum pedido pendente.')).toBeTruthy()
  })

  it('atalhos seguem as permissões', () => {
    dashboard({ permissoes: ['manage_requests', 'create_events'], pendentes: 1 })
    const atalhos = screen.getByRole('heading', { name: 'atalhos' }).closest('section')!
    expect(within(atalhos).getAllByRole('link').map((a) => a.textContent)).toEqual(['Solicitações (1)', 'Criar Evento', 'Ver perfil público ↗'])
  })
})

describe('PendingRequests', () => {
  const requests = (props: Partial<ComponentProps<typeof PendingRequests>> = {}) => inRouter(<PendingRequests pedidos={[]} {...props} />)

  it('mostra quem pede, a atuação (com link só se for artista publicada) e a mensagem', () => {
    requests({
      pedidos: [
        pedido(1, { mensagem: 'Toco techno.', atuacao: { id: 'a1', nome: 'Artista sintético', tipo: 'artista', publicada: true } }),
        pedido(2, { atuacao: { id: 'a2', nome: 'Projeto interno', tipo: 'artista', publicada: false } }),
        pedido(3, { atuacao: { id: 's1', nome: 'Serviços sintéticos', tipo: 'servicos', publicada: true } }),
        pedido(4),
      ],
    })
    const item = (name: string) => screen.getByText(name).closest('li')!
    expect(within(item('Pessoa 1')).getByRole('link', { name: 'Artista sintético' }).getAttribute('href')).toBe('/artistas/a1')
    expect(within(item('Pessoa 1')).getByText('“Toco techno.”')).toBeTruthy()
    expect(within(item('Pessoa 2')).queryByRole('link')).toBeNull()
    expect(within(item('Pessoa 2')).getByText('Projeto interno')).toBeTruthy()
    expect(within(item('Pessoa 3')).queryByRole('link')).toBeNull()
    expect(within(item('Pessoa 3')).getByText('Serviços')).toBeTruthy()
    expect(within(item('Pessoa 4')).queryByText(/“/)).toBeNull()
  })

  it('cada pedido tem um formulário POST com o pedido e dois botões de decisão', () => {
    requests({ pedidos: [pedido(1)] })
    const form = screen.getByRole('button', { name: 'Aprovar pedido de Pessoa 1' }).closest('form')!
    expect(form.getAttribute('method')).toBe('post')
    expect((form.querySelector('input[name="request"]') as HTMLInputElement).value).toBe('09000000-0000-4000-8000-000000000001')
    const buttons = within(form).getAllByRole('button') as HTMLButtonElement[]
    expect(buttons.map((b) => [b.name, b.value])).toEqual([['intent', 'approve'], ['intent', 'decline']])
  })

  it('enquanto a decisão é processada os botões ficam desativados', () => {
    requests({ pedidos: [pedido(1)], busy: true })
    expect((screen.getByRole('button', { name: 'Aprovar pedido de Pessoa 1' }) as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByRole('button', { name: 'Recusar pedido de Pessoa 1' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('só mostra sucesso ou erro quando há resultado do banco', () => {
    const { unmount } = requests({ pedidos: [pedido(1)] })
    expect(screen.queryByRole('status')).toBeNull()
    expect(screen.queryByRole('alert')).toBeNull()
    unmount()
    const ok = requests({ feedback: { ok: true, message: 'Pedido recusado.' } })
    expect(screen.getByRole('status').textContent).toBe('Pedido recusado.')
    ok.unmount()
    requests({ feedback: { ok: false, error: 'Este pedido já foi decidido.' } })
    expect(screen.getByRole('alert').textContent).toBe('[erro] Este pedido já foi decidido.')
  })

  it('fila vazia diz que não há pedidos e lembra que o aprovado entra como Membro', () => {
    requests()
    expect(screen.getByText('Nenhuma solicitação de acesso pendente.')).toBeTruthy()
    expect(screen.getByText('Membro')).toBeTruthy()
  })
})

describe('MyCollectives', () => {
  const c = (n: number) => `05000000-0000-4000-8000-00000000000${n}`
  const props: ComponentProps<typeof MyCollectives> = {
    coletivos: [
      { id: c(1), nome: 'Organização sintética 1', tipo: 'coletivo', cidade: 'Recife', estado: 'PE', situacao: 'approved', cargo: 'Membro', dono: true },
      { id: c(2), nome: 'Organização em análise', tipo: 'produtora', cidade: 'Olinda', estado: 'PE', situacao: 'pending', cargo: 'Membro', dono: true },
    ],
    perfis: [{ id: 'p1', tipo: 'artista', nome: 'Artista sintético', cidade: 'Recife', estado: 'PE', publicado: true, padrao: true }],
    pedidos: [
      { id: 'r1', coletivoId: c(6), coletivoNome: 'Organização sintética 6', situacao: 'pending', criadoEm: '2026-10-07T12:00:00.000Z' },
      { id: 'r2', coletivoId: c(3), coletivoNome: null, situacao: 'rejected', criadoEm: '2026-10-05T12:00:00.000Z' },
    ],
    disponiveis: [
      { id: c(3), nome: 'Organização sintética 3', tipo: 'coletivo', cidade: 'Recife', estado: 'PE', pendente: false },
      { id: c(6), nome: 'Organização sintética 6', tipo: 'produtora', cidade: 'Recife', estado: 'PE', pendente: true },
    ],
  }
  const page = (extra: Partial<ComponentProps<typeof MyCollectives>> = {}) => inRouter(<MyCollectives {...props} {...extra} />)

  it('lista os coletivos: aprovado leva ao dashboard; os demais, à situação, com o selo do estado', () => {
    page()
    const list = screen.getByRole('list', { name: 'Meus coletivos' })
    const approved = within(list).getByRole('heading', { name: 'Organização sintética 1' }).closest('li')!
    expect(within(approved).getByRole('link', { name: 'abrir dashboard →' }).getAttribute('href')).toBe(`/coletivo/${c(1)}/painel`)
    expect(within(approved).getByRole('link', { name: 'perfil público' }).getAttribute('href')).toBe(`/coletivos/${c(1)}`)
    expect(within(approved).getByText('Membro · responsável')).toBeTruthy()
    const pending = within(list).getByRole('heading', { name: 'Organização em análise' }).closest('li')!
    expect(within(pending).getByText('em análise')).toBeTruthy()
    expect(within(pending).getByRole('link', { name: 'ver situação →' }).getAttribute('href')).toBe(`/coletivo/${c(2)}/painel`)
    expect(within(pending).queryByRole('link', { name: 'perfil público' })).toBeNull()
  })

  it('pedidos: só o pendente pode ser cancelado, e o nome ausente não é inventado', () => {
    page()
    const pedidos = screen.getByRole('heading', { name: 'meus pedidos de entrada' }).closest('section')!
    const first = within(pedidos).getByText('Organização sintética 6').closest('li')!
    expect(within(first).getByText('pendente')).toBeTruthy()
    const form = within(first).getByRole('button', { name: 'Cancelar pedido para Organização sintética 6' }).closest('form')!
    expect((form.querySelector('input[name="intent"]') as HTMLInputElement).value).toBe('cancel')
    expect((form.querySelector('input[name="request"]') as HTMLInputElement).value).toBe('r1')
    const second = within(pedidos).getByText('Coletivo indisponível').closest('li')!
    expect(within(second).getByText('recusado')).toBeTruthy()
    expect(within(second).queryByRole('button')).toBeNull()
  })

  it('formulário de pedido: só coletivos sem pedido pendente, atuações do titular e mensagem limitada', () => {
    page()
    const select = screen.getByLabelText(/Coletivo\/Produtora/) as HTMLSelectElement
    expect([...select.options].map((o) => o.textContent)).toEqual(['— selecione —', 'Organização sintética 3 (coletivo)'])
    expect(select.name).toBe('collective')
    const profile = screen.getByLabelText(/Apresentar como/) as HTMLSelectElement
    expect([...profile.options].map((o) => [o.value, o.textContent])).toEqual([['', 'Só o meu nome'], ['p1', 'Artista · Artista sintético']])
    expect((screen.getByLabelText(/Mensagem/) as HTMLTextAreaElement).maxLength).toBe(2000)
    expect(screen.getByText(/Coletivos com pedido pendente não aparecem na lista/)).toBeTruthy()
    const form = select.closest('form')!
    expect(form.getAttribute('method')).toBe('post')
    expect((form.querySelector('input[name="intent"]') as HTMLInputElement).value).toBe('request')
  })

  it('sem coletivo disponível, sem pedidos e sem vínculos: estados vazios verdadeiros', () => {
    page({ coletivos: [], pedidos: [], disponiveis: [] })
    expect(screen.getByText('Você ainda não faz parte de nenhum coletivo/produtora.')).toBeTruthy()
    expect(screen.getByText('Você ainda não pediu entrada em nenhum coletivo.')).toBeTruthy()
    expect(screen.getByText('Nenhum coletivo ou produtora aprovado disponível para novos pedidos.')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'enviar solicitação' })).toBeNull()
  })

  it('mostra o resultado real: sucesso em status, erro em alert; nada antes de existir', () => {
    const idle = page()
    expect(screen.queryByRole('status')).toBeNull()
    expect(screen.queryByRole('alert')).toBeNull()
    idle.unmount()
    const ok = page({ feedback: { ok: true, message: 'Pedido cancelado.' } })
    expect(screen.getByRole('status').textContent).toBe('Pedido cancelado.')
    ok.unmount()
    page({ feedback: { ok: false, error: 'Você já faz parte deste coletivo.' } })
    expect(screen.getByRole('alert').textContent).toBe('[erro] Você já faz parte deste coletivo.')
  })

  it('durante o envio os botões ficam desativados', () => {
    page({ busy: true })
    expect((screen.getByRole('button', { name: 'enviar solicitação' }) as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByRole('button', { name: /Cancelar pedido para/ }) as HTMLButtonElement).disabled).toBe(true)
  })
})

describe('módulos de rota', () => {
  const available: CollectiveAreaData = { status: 'available', coletivo, permissoes: ['manage_requests'], pendentes: 1 }
  const blocked: CollectiveAreaData = { status: 'unavailable', coletivo, situacao: 'pending', motivo: null }
  const routed = (path: string, area: () => CollectiveAreaData | never, children: Parameters<typeof createMemoryRouter>[0]) =>
    render(
      <RouterProvider
        router={createMemoryRouter(
          [{ id: 'root', path: '/', Component: Outlet, children: [{ id: 'routes/layouts/collective', path: 'coletivo/:id', loader: area, Component: withLoader<ComponentProps<typeof CollectiveAreaRoute>>(CollectiveAreaRoute), ErrorBoundary: AreaError, children }] }],
          { initialEntries: [path] },
        )}
      />,
    )
  it('o título da seção vem do nome do coletivo e do caminho', () => {
    expect(areaMeta({ loaderData: available, location: { pathname: `/coletivo/${C}/painel` } } as never)).toEqual([{ title: 'Organização sintética 1 · Dashboard · CIRCUITO NE' }])
    expect(areaMeta({ loaderData: available, location: { pathname: `/coletivo/${C}/solicitacoes/` } } as never)).toEqual([{ title: 'Organização sintética 1 · Solicitações · CIRCUITO NE' }])
    expect(areaMeta({ loaderData: available, location: { pathname: `/coletivo/${C}/membros` } } as never)).toEqual([{ title: 'Organização sintética 1 · CIRCUITO NE' }])
    expect(areaMeta({ loaderData: undefined, location: { pathname: `/coletivo/${C}/painel` } } as never)).toEqual([{ title: 'Coletivo · Dashboard · CIRCUITO NE' }])
  })

  it('coletivo aprovado: layout com menu por permissões e a página filha', async () => {
    routed(`/coletivo/${C}/painel`, () => available, [
      {
        path: 'painel',
        loader: () => ({ eventos: [evento(1)], gestao: false, mensagens: null }),
        Component: withLoader<ComponentProps<typeof CollectiveDashboardRoute>>(CollectiveDashboardRoute),
      },
    ])
    expect(await screen.findByRole('link', { name: /Evento sintético 1/ })).toBeTruthy()
    expect(links().map(([label]) => label)).toEqual(['Dashboard', 'Solicitações (1)'])
    expect(screen.getByRole('status', { name: '' }).textContent).toBe('1 pedido pendente.')
  })

  it('coletivo não aprovado: mostra só o estado, sem a página filha', async () => {
    routed(`/coletivo/${C}/painel`, () => blocked, [
      { path: 'painel', loader: () => { throw data({ message: 'x' }, { status: 403 }) }, Component: () => <p>não deveria aparecer</p>, ErrorBoundary: DashboardError },
    ])
    expect(await screen.findByText('em análise')).toBeTruthy()
    expect(screen.queryByText('não deveria aparecer')).toBeNull()
    expect(screen.queryByRole('navigation', { name: 'Seções do coletivo' })).toBeNull()
  })

  it('quem não é membro vê "não encontrado", igual a um coletivo que não existe', async () => {
    routed(`/coletivo/${C}/painel`, () => { throw data({ message: 'Coletivo não encontrado.' }, { status: 404 }) }, [
      { path: 'painel', Component: () => <p>não deveria aparecer</p> },
    ])
    expect(await screen.findByText(/Coletivo não encontrado\./)).toBeTruthy()
    expect(screen.getByRole('link', { name: 'voltar para meus coletivos' }).getAttribute('href')).toBe('/painel/coletivos')
    expect(screen.queryByText('não deveria aparecer')).toBeNull()
  })

  it('403 de uma página filha mostra o motivo dentro do layout, mantendo o menu', async () => {
    routed(`/coletivo/${C}/solicitacoes`, () => ({ ...available, permissoes: [], pendentes: null }) as CollectiveAreaData, [
      {
        path: 'solicitacoes',
        loader: () => { throw data({ message: 'Você não tem permissão para gerir pedidos de entrada neste coletivo.' }, { status: 403 }) },
        Component: CollectiveRequestsRoute as never,
        ErrorBoundary: DashboardError,
      },
    ])
    expect(await screen.findByText(/não tem permissão para gerir pedidos de entrada/)).toBeTruthy()
    expect(links()).toEqual([['Dashboard', `/coletivo/${C}/painel`]])
  })

  it('503 de uma página filha pede nova tentativa, sem fingir lista vazia', async () => {
    routed(`/coletivo/${C}/painel`, () => available, [
      { path: 'painel', loader: () => { throw data({ message: 'x' }, { status: 503 }) }, Component: CollectiveDashboardRoute as never, ErrorBoundary: DashboardError },
    ])
    expect((await screen.findByRole('alert')).textContent).toMatch(/Não foi possível carregar esta página/)
  })

  it('aprovar um pedido: o sucesso só aparece depois da resposta da ação e a fila é recarregada', async () => {
    const queue = [pedido(1), pedido(2)]
    let release!: () => void
    const gate = new Promise<void>((resolve) => { release = resolve })
    const submitted: string[] = []
    routed(`/coletivo/${C}/solicitacoes`, () => available, [
      {
        path: 'solicitacoes',
        loader: () => ({ pedidos: [...queue] }),
        action: async ({ request }: { request: Request }) => {
          const form = await request.formData()
          submitted.push(`${form.get('intent')}:${form.get('request')}`)
          await gate
          queue.shift()
          return data<ActionResult>({ ok: true, message: 'Pedido aprovado. A pessoa agora faz parte do coletivo com o perfil Membro.' })
        },
        Component: withLoader<ComponentProps<typeof CollectiveRequestsRoute>>(CollectiveRequestsRoute),
      },
    ])
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: 'Aprovar pedido de Pessoa 1' }))
    expect(submitted).toEqual(['approve:09000000-0000-4000-8000-000000000001'])
    expect(screen.queryByRole('status', { name: '' })?.textContent ?? '').not.toMatch(/Pedido aprovado/)
    release()
    expect(await screen.findByText(/Pedido aprovado\./)).toBeTruthy()
    await waitFor(() => expect(screen.queryByText('Pessoa 1')).toBeNull())
    expect(screen.getByText('Pessoa 2')).toBeTruthy()
  })

  it('meus coletivos: erro do banco aparece como alerta e mantém o que foi digitado', async () => {
    const view = {
      ...{
        coletivos: [], perfis: [], pedidos: [],
        disponiveis: [{ id: C, nome: 'Organização sintética 1', tipo: 'coletivo', cidade: 'Recife', estado: 'PE', pendente: false }],
      },
    }
    const seen: Record<string, string> = {}
    render(
      <RouterProvider
        router={createMemoryRouter(
          [
            {
              id: 'root',
              path: '/painel/coletivos',
              loader: () => view,
              action: async ({ request }: { request: Request }) => {
                const form = await request.formData()
                for (const [key, value] of form) seen[key] = String(value)
                return data<ActionResult>({ ok: false, error: 'Você já faz parte deste coletivo.' }, { status: 409 })
              },
              Component: withLoader<ComponentProps<typeof MyCollectivesRoute>>(MyCollectivesRoute),
            },
          ],
          { initialEntries: ['/painel/coletivos'] },
        )}
      />,
    )
    const user = userEvent.setup()
    await user.selectOptions(await screen.findByLabelText(/Coletivo\/Produtora/), C)
    await user.type(screen.getByLabelText(/Mensagem/), 'Olá, quero entrar')
    await user.click(screen.getByRole('button', { name: 'enviar solicitação' }))
    expect((await screen.findByRole('alert')).textContent).toBe('[erro] Você já faz parte deste coletivo.')
    expect(seen).toEqual({ intent: 'request', collective: C, profile: '', message: 'Olá, quero entrar' })
    expect((screen.getByLabelText(/Mensagem/) as HTMLTextAreaElement).value).toBe('Olá, quero entrar')
    expect(screen.queryByRole('status')).toBeNull()
  })
})
