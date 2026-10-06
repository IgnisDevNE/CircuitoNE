import { render, screen, waitFor, within, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, data, RouterProvider, useActionData, useLoaderData } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ArtistProfile } from '../../src/pages/public/ArtistProfile'
import { CollectiveProfile } from '../../src/pages/public/CollectiveProfile'
import { Messages } from '../../src/pages/app/Messages'
import { NewMessage } from '../../src/pages/app/NewMessage'
import { CollectiveMessages } from '../../src/pages/collective/CollectiveMessages'
import { revalidateAfterSubmit } from '../../src/lib/revalidate'
import { REFRESH_INTERVAL_MS } from '../../src/lib/messages'
import type { ActionResult } from '../../src/lib/action-result'
import { identityOf, toConversaItem, type ConversaItem, type MessagesPageData, type Mensagem, type Lado } from '../../src/server/mappers/messages'

const ME = '02000000-0000-4000-8000-000000000001'
const OTHER = '02000000-0000-4000-8000-000000000007'
const C = '05000000-0000-4000-8000-000000000001'
const CONV = '0d000000-0000-4000-8000-000000000001'
const CONV2 = '0d000000-0000-4000-8000-000000000002'

const me: Lado = { kind: 'profile', id: ME, nome: 'Minha atuação' }
const other: Lado = { kind: 'profile', id: OTHER, nome: 'Interlocutor' }
const col: Lado = { kind: 'collective', id: C, nome: 'Organização 1' }

function item(n: number, extra: Partial<ConversaItem> = {}, sides: [Lado, Lado] = [me, other], who = identityOf([{ kind: 'profile', id: ME }])): ConversaItem {
  const base = toConversaItem(
    { id: `0d000000-0000-4000-8000-00000000000${n}`, atualizadaEm: '2026-10-06T12:00:00.000Z', cursor: 'x', lados: sides, bloqueada: false, arquivada: false, naoLidas: 0 },
    { ultima: { texto: `Última ${n}`, criadaEm: '2026-10-06T12:00:00.000Z', autor: other }, bloqueadaPor: [] },
    who,
  )
  return { ...base, ...extra }
}
const msg = (n: number, autor: Lado, texto = `Texto ${n}`): Mensagem => ({
  id: `0e000000-0000-4000-8000-00000000000${n}`, texto, criadaEm: `2026-10-06T10:0${n}:00.000Z`, cursor: 'c', autor,
})
const page = (extra: Partial<MessagesPageData> = {}): MessagesPageData => ({
  conversas: [item(1, { naoLidas: 2 }), item(2)], limitada: false, podeEnviar: true, aberta: null, ...extra,
})
const opened = (conversa = item(1, { naoLidas: 2 }), mensagens = [msg(1, other), msg(2, me)], extra = {}) => ({
  conversa, mensagens, maisAnteriores: false, paginas: 1, ...extra,
})

beforeEach(() => {
  vi.stubGlobal('matchMedia', vi.fn((query: string) => ({ matches: false, media: query, addEventListener: vi.fn(), removeEventListener: vi.fn() })))
})

type Handler = (formData: FormData, request: Request) => ActionResult | Promise<ActionResult> | Response
/** Rota com `:conversationId?` como no framework; o `action` registra os envios e responde como o servidor. */
function setup(
  loaderData: MessagesPageData | (() => MessagesPageData),
  options: { path?: string; collective?: boolean; action?: Handler } = {},
) {
  const submitted: { intent: string; fields: Record<string, string> }[] = []
  const loader = vi.fn(async () => data(typeof loaderData === 'function' ? loaderData() : loaderData))
  const action = vi.fn(async ({ request }: { request: Request }) => {
    const form = await request.formData()
    submitted.push({ intent: String(form.get('intent')), fields: Object.fromEntries([...form].map(([k, v]) => [k, String(v)])) })
    const result = options.action ? await options.action(form, request) : ({ ok: true, message: 'ok' } as ActionResult)
    return result instanceof Response ? result : data(result, { status: result.ok ? 200 : 409 })
  })
  const base = options.collective ? `/coletivo/${C}/mensagens` : '/painel/mensagens'
  function Component() {
    const loaded = useLoaderData() as MessagesPageData
    const feedback = useActionData() as ActionResult | undefined
    return options.collective ? <CollectiveMessages coletivoId={C} {...loaded} feedback={feedback ?? null} /> : <Messages {...loaded} feedback={feedback ?? null} />
  }
  const router = createMemoryRouter(
    [{ path: `${base}/:conversationId?`, element: <Component />, loader, action, shouldRevalidate: revalidateAfterSubmit }],
    { initialEntries: [options.path ?? base] },
  )
  render(<RouterProvider router={router} />)
  return { router, loader, action, submitted }
}

describe('Messages (lista)', () => {
  it('lista as conversas com a última mensagem e as não lidas, sem conversa aberta', async () => {
    setup(page())
    const list = await screen.findByRole('navigation', { name: 'Conversas' })
    const first = within(list).getAllByRole('link')[0]
    expect(first.getAttribute('href')).toBe(`/painel/mensagens/${CONV}`)
    expect(first.textContent).toContain('Interlocutor')
    expect(first.textContent).toContain('Última 1')
    expect(within(first).getByText('2 não lidas')).toBeTruthy()
    expect(screen.getByText('Selecione uma conversa.')).toBeTruthy()
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('$ central_de_mensagens')
  })

  it('sem conversas mostra o estado vazio e a orientação para começar uma', async () => {
    setup(page({ conversas: [] }))
    expect(await screen.findByText('Nenhuma conversa ainda.')).toBeTruthy()
    expect(screen.getByText(/Enviar mensagem/)).toBeTruthy()
  })

  it('avisa quando a lista está limitada às 50 mais recentes', async () => {
    setup(page({ limitada: true }))
    expect(await screen.findByText('Mostrando as 50 conversas mais recentes.')).toBeTruthy()
  })
})

describe('Chat', () => {
  const path = `/painel/mensagens/${CONV}`

  it('mostra as mensagens em ordem, com o nome de quem enviou só nas recebidas', async () => {
    setup(page({ aberta: opened() }), { path })
    const log = await screen.findByRole('log', { name: 'Conversa: Interlocutor' })
    const bubbles = within(log).getAllByRole('listitem')
    expect(bubbles.map((b) => b.querySelector('p.whitespace-pre-wrap')?.textContent)).toEqual(['Texto 1', 'Texto 2'])
    expect(within(bubbles[0]).getByText('Interlocutor')).toBeTruthy()
    expect(within(bubbles[1]).queryByText('Minha atuação')).toBeNull()
  })

  it('renderiza o corpo como texto puro: HTML e markdown nunca são interpretados', async () => {
    const evil = '<img src=x onerror="window.__pwned=1"> <b>negrito</b> **md** [link](javascript:alert(1))\nsegunda linha'
    setup(page({ aberta: opened(item(1), [msg(1, other, evil)]) }), { path })
    const log = await screen.findByRole('log')
    expect(log.querySelector('img')).toBeNull()
    expect(log.querySelector('b')).toBeNull()
    expect(log.querySelector('a')).toBeNull()
    expect(within(log).getByText(/<img src=x/).textContent).toBe(evil)
    expect((window as unknown as { __pwned?: number }).__pwned).toBeUndefined()
  })

  it('marca como lida quando há não lidas, uma vez por mensagem, e depois não repete', async () => {
    const { submitted, router } = setup(() => page({ aberta: opened(item(1, { naoLidas: 2 })) }), { path })
    await screen.findByRole('log')
    await waitFor(() => expect(submitted).toEqual([{ intent: 'read', fields: { intent: 'read', last: '0e000000-0000-4000-8000-000000000002' } }]))
    await waitFor(() => expect(router.state.fetchers.size).toBeGreaterThanOrEqual(0))
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(submitted).toHaveLength(1)
  })

  it('sem não lidas não grava nada', async () => {
    const { submitted } = setup(page({ aberta: opened(item(1, { naoLidas: 0 })) }), { path })
    await screen.findByRole('log')
    await new Promise((resolve) => setTimeout(resolve, 30))
    expect(submitted).toEqual([])
  })

  it('envia a mensagem com a chave de idempotência e o remetente, e limpa o campo só depois do sucesso', async () => {
    const user = userEvent.setup()
    const { submitted } = setup(page({ aberta: opened(item(1)) }), {
      path,
      action: () => ({ ok: true, message: 'Mensagem enviada.' }),
    })
    const box = await screen.findByRole('textbox', { name: 'Mensagem para Interlocutor' })
    const send = screen.getByRole('button', { name: 'enviar' }) as HTMLButtonElement
    expect(send.disabled).toBe(true)
    await user.type(box, 'Olá!')
    expect(send.disabled).toBe(false)
    await user.click(send)
    await waitFor(() => expect(submitted).toHaveLength(1))
    expect(submitted[0].fields).toMatchObject({ intent: 'send', body: 'Olá!', via: `profile:${ME}>profile:${OTHER}` })
    expect(submitted[0].fields.request_id).toMatch(/^[0-9a-f-]{36}$/)
    expect(await screen.findByRole('status')).toHaveProperty('textContent', 'Mensagem enviada.')
    await waitFor(() => expect((box as HTMLTextAreaElement).value).toBe(''))
  })

  it('recusa do banco: mostra o erro em pt-BR e mantém o texto digitado', async () => {
    const user = userEvent.setup()
    setup(page({ aberta: opened(item(1)) }), {
      path,
      action: () => ({ ok: false, error: 'Esta conversa está bloqueada: ninguém pode enviar mensagens enquanto o bloqueio durar.' }),
    })
    const box = await screen.findByRole('textbox', { name: 'Mensagem para Interlocutor' })
    await user.type(box, 'Não some')
    await user.click(screen.getByRole('button', { name: 'enviar' }))
    expect((await screen.findByRole('alert')).textContent).toContain('[erro] Esta conversa está bloqueada')
    expect((box as HTMLTextAreaElement).value).toBe('Não some')
  })

  it('recarrega os dados depois de um envio recusado (a conversa pode ter mudado)', async () => {
    const user = userEvent.setup()
    const { loader } = setup(page({ aberta: opened(item(1)) }), { path, action: () => ({ ok: false, error: 'x' }) })
    await user.type(await screen.findByRole('textbox', { name: 'Mensagem para Interlocutor' }), 'a')
    const before = loader.mock.calls.length
    await user.click(screen.getByRole('button', { name: 'enviar' }))
    await waitFor(() => expect(loader.mock.calls.length).toBeGreaterThan(before))
  })

  it('duas atuações do titular: escolhe com qual enviar', async () => {
    const both = identityOf([{ kind: 'profile', id: ME }, { kind: 'profile', id: OTHER }])
    const user = userEvent.setup()
    const { submitted } = setup(page({ aberta: opened(item(1, {}, [me, other], both), []) }), { path })
    const select = await screen.findByRole('combobox', { name: 'Enviar como' })
    await user.selectOptions(select, 'Interlocutor')
    await user.type(screen.getByRole('textbox', { name: /Mensagem para/ }), 'Oi')
    await user.click(screen.getByRole('button', { name: 'enviar' }))
    await waitFor(() => expect(submitted[0].fields.via).toBe(`profile:${OTHER}>profile:${ME}`))
  })

  it('conversa bloqueada: sem campo de envio, com aviso e opção de desbloquear quando fui eu', async () => {
    const user = userEvent.setup()
    const { submitted } = setup(
      page({ aberta: opened(item(1, { bloqueada: true, bloqueadaPorMim: true, bloqueadaComo: me }), []) }),
      { path },
    )
    expect(await screen.findByText(/Conversa bloqueada: ninguém envia mensagens/)).toBeTruthy()
    expect(screen.queryByRole('textbox')).toBeNull()
    await user.click(screen.getByRole('button', { name: 'desbloquear' }))
    await waitFor(() => expect(submitted).toEqual([{ intent: 'unblock', fields: { intent: 'unblock', as: `profile:${ME}` } }]))
  })

  it('bloqueio do outro lado: não oferece desbloquear, só bloquear também', async () => {
    setup(page({ aberta: opened(item(1, { bloqueada: true, bloqueadaPorMim: false, bloqueadaComo: null }), []) }), { path })
    expect(await screen.findByText(/Só quem bloqueou pode desbloquear\./)).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'desbloquear' })).toBeNull()
    expect(screen.getByRole('button', { name: 'bloquear conversa' })).toBeTruthy()
  })

  it('bloqueia a conversa como a minha atuação', async () => {
    const user = userEvent.setup()
    const { submitted } = setup(page({ aberta: opened(item(1)) }), { path })
    await user.click(await screen.findByRole('button', { name: 'bloquear conversa' }))
    await waitFor(() => expect(submitted[0].fields).toEqual({ intent: 'block', as: `profile:${ME}` }))
  })

  it('conversa arquivada mantém o histórico sem campo de envio', async () => {
    setup(page({ aberta: opened(item(1, { arquivada: true })) }), { path })
    expect(await screen.findByText(/Conversa arquivada/)).toBeTruthy()
    expect(screen.queryByRole('textbox', { name: /Mensagem para/ })).toBeNull()
  })

  it('denuncia uma mensagem recebida com o motivo; mensagens minhas não têm denúncia', async () => {
    const user = userEvent.setup()
    const { submitted } = setup(page({ aberta: opened(item(1)) }), { path, action: () => ({ ok: true, message: 'Denúncia enviada.' }) })
    await screen.findByRole('log')
    expect(screen.getAllByText('denunciar')).toHaveLength(1)
    await user.click(screen.getByText('denunciar'))
    await user.type(screen.getByRole('textbox', { name: 'Motivo da denúncia' }), 'Spam')
    await user.click(screen.getByRole('button', { name: /Enviar denúncia da mensagem de Interlocutor/ }))
    await waitFor(() => expect(submitted[submitted.length - 1]?.fields).toEqual({ intent: 'report', message: '0e000000-0000-4000-8000-000000000001', reason: 'Spam' }))
  })

  it('"carregar anteriores" pede mais uma página por URL, mantendo o link da conversa', async () => {
    setup(page({ aberta: opened(item(1), [msg(1, other)], { maisAnteriores: true, paginas: 2 }) }), { path })
    const more = await screen.findByRole('link', { name: 'carregar anteriores' })
    expect(more.getAttribute('href')).toBe(`${path}?paginas=3`)
  })

  it('só leitura (coletivo sem "enviar mensagens"): mostra o motivo e nenhum campo', async () => {
    const who = identityOf([{ kind: 'collective', id: C }])
    const conversa = item(1, {}, [col, other], who)
    setup(page({ podeEnviar: false, conversas: [conversa], aberta: opened(conversa, [msg(1, other)]) }), {
      collective: true,
      path: `/coletivo/${C}/mensagens/${CONV}`,
    })
    expect(await screen.findByText(/permite ler as mensagens, mas não enviar/)).toBeTruthy()
    expect(screen.queryByRole('textbox', { name: /Mensagem para/ })).toBeNull()
    expect(screen.getByRole('link', { name: /Interlocutor/ }).getAttribute('href')).toBe(`/coletivo/${C}/mensagens/${CONV}`)
  })

  it('o coletivo envia em nome do coletivo', async () => {
    const user = userEvent.setup()
    const who = identityOf([{ kind: 'collective', id: C }])
    const conversa = item(1, {}, [col, other], who)
    const { submitted } = setup(page({ conversas: [conversa], aberta: opened(conversa, [msg(1, other)]) }), { collective: true, path: `/coletivo/${C}/mensagens/${CONV}` })
    await user.type(await screen.findByRole('textbox', { name: 'Mensagem para Interlocutor' }), 'Resposta')
    await user.click(screen.getByRole('button', { name: 'enviar' }))
    await waitFor(() => expect(submitted[0].fields.via).toBe(`collective:${C}>profile:${OTHER}`))
  })
})

describe('atualização automática', () => {
  it('recarrega a cada 15 s com a aba visível, e o botão "atualizar" faz o mesmo na hora', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const { loader } = setup(page({ aberta: opened(item(1, { naoLidas: 0 })) }), { path: `/painel/mensagens/${CONV}` })
    await screen.findByRole('log')
    const before = loader.mock.calls.length
    await act(async () => {
      await vi.advanceTimersByTimeAsync(REFRESH_INTERVAL_MS + 100)
    })
    expect(loader.mock.calls.length).toBeGreaterThan(before)
    const mid = loader.mock.calls.length
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')
    await act(async () => {
      await vi.advanceTimersByTimeAsync(REFRESH_INTERVAL_MS * 2)
    })
    expect(loader.mock.calls.length).toBe(mid)
    await act(async () => {
      screen.getByRole('button', { name: 'atualizar' }).click()
      await vi.advanceTimersByTimeAsync(50)
    })
    expect(loader.mock.calls.length).toBeGreaterThan(mid)
  })
})

describe('NewMessage', () => {
  const props = { destinatario: { kind: 'profile' as const, id: OTHER, nome: 'Artista público' }, remetentes: [me] }
  function WithFeedback({ extra }: { extra: object }) {
    return <NewMessage {...props} {...extra} feedback={useActionData() as ActionResult | undefined} />
  }
  const render1 = (extra = {}, action?: () => ActionResult) => {
    const submitted: Record<string, string>[] = []
    const router = createMemoryRouter(
      [{
        path: '/painel/mensagens/nova',
        element: <WithFeedback extra={extra} />,
        action: async ({ request }) => {
          submitted.push(Object.fromEntries([...(await request.formData())].map(([k, v]) => [k, String(v)])))
          return data(action ? action() : { ok: true, message: 'ok' })
        },
      }],
      { initialEntries: ['/painel/mensagens/nova'] },
    )
    render(<RouterProvider router={router} />)
    return submitted
  }

  it('compõe e envia para o destinatário com uma só atuação', async () => {
    const user = userEvent.setup()
    const submitted = render1()
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('$ nova_mensagem')
    expect(screen.getByText('Enviando como Minha atuação.')).toBeTruthy()
    await user.type(screen.getByRole('textbox', { name: 'Mensagem para Artista público' }), 'Oi, vamos tocar?')
    await user.click(screen.getByRole('button', { name: 'enviar mensagem' }))
    await waitFor(() => expect(submitted).toHaveLength(1))
    expect(submitted[0]).toMatchObject({ via: `profile:${ME}>profile:${OTHER}`, body: 'Oi, vamos tocar?' })
    expect(submitted[0].request_id).toMatch(/^[0-9a-f-]{36}$/)
  })

  it('várias atuações: escolhe com qual enviar', () => {
    render1({ remetentes: [me, { kind: 'collective', id: C, nome: 'Organização 1' }] })
    expect(within(screen.getByRole('combobox', { name: 'Enviar como' })).getAllByRole('option').map((o) => o.textContent)).toEqual(['Minha atuação', 'Organização 1'])
  })

  it('sem remetente possível mostra o motivo no lugar do formulário', () => {
    render1({ remetentes: [] })
    expect(screen.getByText(/Você não tem uma atuação que possa enviar mensagens para Artista público/)).toBeTruthy()
    expect(screen.queryByRole('textbox')).toBeNull()
  })

  it('erro do banco aparece traduzido', async () => {
    const user = userEvent.setup()
    render1({}, () => ({ ok: false, error: 'Você atingiu o limite de novas conversas de hoje. Tente de novo amanhã.' }))
    await user.type(screen.getByRole('textbox', { name: /Mensagem para/ }), 'a')
    await user.click(screen.getByRole('button', { name: 'enviar mensagem' }))
    expect((await screen.findByRole('alert')).textContent).toContain('limite de novas conversas')
  })
})

describe('ação "Enviar mensagem" nas páginas públicas', () => {
  const artist = {
    artista: { id: OTHER, nome: 'Artista público', bio: '', cidade: 'Recife', estado: 'PE', foto: '', fotos: [], estilos: [], social: {}, corPredominante: null },
    proximos: [],
    anteriores: [],
  } as unknown as Parameters<typeof ArtistProfile>[0]
  const inRouter = (ui: React.ReactElement) => render(<RouterProvider router={createMemoryRouter([{ path: '*', element: ui }])} />)

  it('logado leva à composição; visitante é levado a entrar; sem sessão nada aparece', async () => {
    const { unmount } = render(<RouterProvider router={createMemoryRouter([{ path: '*', element: <ArtistProfile {...artist} sessao={{ signedIn: true }} /> }])} />)
    expect((await screen.findByRole('link', { name: 'Enviar mensagem' })).getAttribute('href')).toBe(`/painel/mensagens/nova?para=profile:${OTHER}`)
    unmount()
    const guest = render(<RouterProvider router={createMemoryRouter([{ path: '*', element: <ArtistProfile {...artist} sessao={{ signedIn: false }} /> }])} />)
    expect((await screen.findByRole('link', { name: 'Entrar para enviar mensagem' })).getAttribute('href')).toBe('/entrar')
    guest.unmount()
    inRouter(<ArtistProfile {...artist} />)
    await screen.findByRole('heading', { level: 1, name: 'Artista público' })
    expect(screen.queryByRole('link', { name: /mensagem/ })).toBeNull()
  })

  it('a página do coletivo aponta para collective:<id>', async () => {
    const coletivo = { id: C, nome: 'Organização 1', tipo: 'coletivo', cidade: 'Recife', estado: 'PE', bio: '', imagem: '', social: {}, corPredominante: '#ff2040' }
    inRouter(<CollectiveProfile {...({ coletivo, membros: [], proximos: [], anteriores: [] } as unknown as Parameters<typeof CollectiveProfile>[0])} sessao={{ signedIn: true }} />)
    expect((await screen.findByRole('link', { name: 'Enviar mensagem' })).getAttribute('href')).toBe(`/painel/mensagens/nova?para=collective:${C}`)
  })
})
