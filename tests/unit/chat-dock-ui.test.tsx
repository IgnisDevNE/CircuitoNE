import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, data, Outlet, RouterProvider } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ChatDock } from '../../src/components/chat/ChatDock'
import { ChatDockProvider } from '../../src/components/chat/ChatDockProvider'
import { MessageAction } from '../../src/components/ui/MessageAction'
import { CHAT_STORAGE_KEY, type ChatConversa, type ChatOpen } from '../../src/lib/chat'
import { REFRESH_INTERVAL_MS } from '../../src/lib/messages'
import type { Lado, Mensagem } from '../../src/server/mappers/messages'

const ME = '02000000-0000-4000-8000-000000000001'
const ME2 = '02000000-0000-4000-8000-000000000002'
const OTHER = '02000000-0000-4000-8000-000000000007'
const C = '05000000-0000-4000-8000-000000000001'
const CONV = '0d000000-0000-4000-8000-000000000001'
const CONV2 = '0d000000-0000-4000-8000-000000000002'
const PARA = `profile:${OTHER}`

const me: Lado = { kind: 'profile', id: ME, nome: 'Minha atuação' }
const me2: Lado = { kind: 'profile', id: ME2, nome: 'Outro projeto meu' }
const other: Lado = { kind: 'profile', id: OTHER, nome: 'Interlocutor' }
const col: Lado = { kind: 'collective', id: C, nome: 'Organização 1' }

let n = 0
const msg = (autor: Lado, texto: string): Mensagem => {
  n += 1
  return {
    id: `0e000000-0000-4000-8000-${String(n).padStart(12, '0')}`,
    texto,
    criadaEm: `2026-10-06T10:${String(n).padStart(2, '0')}:00.000Z`,
    cursor: `2026-10-06T10:${String(n).padStart(2, '0')}:00.000001+00:00`,
    autor,
  }
}

type Thread = { mensagens: Mensagem[]; maisAnteriores: boolean; bloqueada: boolean }
type Server = {
  open: ChatOpen | { status: number; error: string }
  threads: Record<string, Thread>
  send: (fields: URLSearchParams) => Response | Promise<Response>
  read: (fields: URLSearchParams) => Response
}

let server: Server
let requests: { method: string; url: string; body?: URLSearchParams }[]
let loaderCalls: number

const conversa = (id: string, de: Lado, extra: Partial<ChatConversa> = {}): ChatConversa => ({ id, de, naoLidas: 0, bloqueada: false, arquivada: false, ...extra })
const emptyOpen = (extra: Partial<ChatOpen> = {}): ChatOpen => ({ destinatario: other, remetentes: [me], conversas: [], inicial: null, ...extra })
const withHistory = (mensagens: Mensagem[], extra: Partial<Thread> = {}): ChatOpen =>
  emptyOpen({ conversas: [conversa(CONV, me)], inicial: { conversationId: CONV, mensagens, maisAnteriores: false, bloqueada: false, ...extra } })

beforeEach(() => {
  n = 0
  loaderCalls = 0
  requests = []
  window.sessionStorage.clear()
  server = {
    open: emptyOpen(),
    threads: {},
    send: () => Response.json({ ok: true, message: 'Mensagem enviada.', conversation_id: CONV }),
    read: () => Response.json({ ok: true, message: 'Conversa marcada como lida.' }),
  }
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(String(input), 'http://localhost')
      const body = init?.body instanceof URLSearchParams ? init.body : undefined
      requests.push({ method: init?.method ?? 'GET', url: url.pathname + url.search, body })
      if (url.pathname === '/api/chat/abrir') return 'status' in server.open ? Response.json({ error: server.open.error }, { status: server.open.status }) : Response.json(server.open)
      if (url.pathname === '/api/chat/conversa') {
        const thread = server.threads[url.searchParams.get('id') ?? '']
        return thread ? Response.json(thread) : Response.json({ error: 'Conversa não encontrada.' }, { status: 404 })
      }
      if (url.pathname === '/api/chat/enviar') return server.send(body!)
      if (url.pathname === '/api/chat/lida') return server.read(body!)
      throw new Error('fetch inesperado: ' + url.pathname)
    }),
  )
})

/** Raiz como a do app: provedor, página, dock; o layout público oferece a sessão (loader com o id do framework). */
function setup(options: { signedIn?: boolean; initial?: string } = {}) {
  const { signedIn = true } = options
  const router = createMemoryRouter(
    [
      {
        path: '/',
        element: (
          <ChatDockProvider>
            <Outlet />
            <ChatDock />
          </ChatDockProvider>
        ),
        children: [
          {
            id: 'routes/layouts/public',
            loader: () => {
              loaderCalls += 1
              return data({ signedIn, name: null })
            },
            element: <Outlet />,
            children: [
              {
                index: true,
                element: (
                  <main>
                    <h1>Artista</h1>
                    <MessageAction para={PARA} sessao={{ signedIn }} />
                    <MessageAction para={`collective:${C}`} sessao={{ signedIn }} />
                  </main>
                ),
              },
              { path: 'outra', element: <main><h1>Outra página</h1></main> },
              { path: 'painel/mensagens/:id', element: <main><h1>Conversa completa</h1></main> },
            ],
          },
        ],
      },
    ],
    { initialEntries: [options.initial ?? '/'] },
  )
  render(<RouterProvider router={router} />)
  return router
}

const dialog = () => screen.getByRole('dialog')
const textbox = () => within(dialog()).getByRole('textbox')
const opener = () => screen.getAllByRole('link', { name: 'Enviar mensagem' })[0]
const posts = (path: string) => requests.filter((r) => r.method === 'POST' && r.url === path)

async function openWindow() {
  const user = userEvent.setup()
  const router = setup()
  const [link] = await screen.findAllByRole('link', { name: 'Enviar mensagem' })
  await user.click(link)
  await screen.findByRole('dialog')
  return { user, router, link }
}

describe('abrir a janela a partir de "Enviar mensagem"', () => {
  it('abre a janela no canto sem navegar, com o foco no campo de mensagem e atributos de diálogo não modal', async () => {
    server.open = withHistory([msg(other, 'Oi, tudo bem?'), msg(me, 'Tudo!')])
    const { router } = await openWindow()
    expect(router.state.location.pathname).toBe('/')
    expect(dialog().getAttribute('aria-modal')).toBe('false')
    expect(dialog().getAttribute('aria-label')).toMatch(/^Conversa com /)
    await waitFor(() => expect(dialog().getAttribute('aria-label')).toBe('Conversa com Interlocutor'))
    expect(document.activeElement).toBe(textbox())
    expect(textbox().getAttribute('aria-describedby')).toBeTruthy()
    expect(within(dialog()).getByLabelText('Mensagem para Interlocutor')).toBe(textbox())
    // Nada da tela completa foi aberta e a leitura foi uma chamada JSON, não uma navegação.
    expect(requests.map((r) => r.url)).toEqual([`/api/chat/abrir?para=${encodeURIComponent(PARA)}`])
    const log = await within(dialog()).findByRole('log', { name: 'Mensagens com Interlocutor' })
    expect(within(log).getByText('Oi, tudo bem?')).toBeTruthy()
    expect(within(log).getByText('Tudo!')).toBeTruthy()
    expect(log.getAttribute('aria-live')).toBe('polite')
    expect(within(dialog()).getByRole('link', { name: 'abrir conversa completa' }).getAttribute('href')).toBe(`/painel/mensagens/${CONV}`)
  })

  it('o link continua apontando para a tela completa (nova aba, sem JavaScript) e não intercepta Ctrl+clique', async () => {
    setup()
    const link = await screen.findAllByRole('link', { name: 'Enviar mensagem' })
    expect(link[0].getAttribute('href')).toBe(`/painel/mensagens/nova?para=${PARA}`)
    // jsdom não navega entre documentos: o clique só precisa chegar ao navegador sem ser cancelado pelo componente.
    let cancelledByComponent = true
    document.addEventListener('click', (event) => ((cancelledByComponent = event.defaultPrevented), event.preventDefault()), { once: true })
    fireEvent.click(link[0], { ctrlKey: true })
    expect(cancelledByComponent).toBe(false)
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('sem conversa ainda: estado vazio para compor; a conversa só nasce no primeiro envio', async () => {
    await openWindow()
    expect(await within(dialog()).findByText('Nenhuma mensagem ainda. Escreva a primeira.')).toBeTruthy()
    expect(within(dialog()).queryByRole('link', { name: 'abrir conversa completa' })).toBeNull()
    expect(within(dialog()).getByText('Enviando como Minha atuação.')).toBeTruthy()
    expect(posts('/api/chat/enviar')).toEqual([])
  })

  it('visitante vê o link para entrar e nenhuma janela', async () => {
    setup({ signedIn: false })
    const link = await screen.findAllByRole('link', { name: 'Entrar para enviar mensagem' })
    expect(link[0].getAttribute('href')).toBe('/entrar')
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('janelas guardadas na aba não aparecem para um visitante, que ainda apaga o que sobrou', async () => {
    window.sessionStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify([{ para: PARA, nome: 'Interlocutor', minimized: false }]))
    setup({ signedIn: false })
    await screen.findAllByRole('link', { name: 'Entrar para enviar mensagem' })
    expect(screen.queryByRole('dialog')).toBeNull()
    await waitFor(() => expect(window.sessionStorage.getItem(CHAT_STORAGE_KEY)).toBeNull())
    expect(requests).toEqual([])
  })
})

describe('envio', () => {
  it('envia como texto, com a chave de idempotência, limpa o campo, mostra a mensagem e atualiza o menu (revalidação)', async () => {
    const { user } = await openWindow()
    const text = 'Primeiro contato <b>negrito</b> 👋'
    await user.type(textbox(), text)
    server.threads[CONV] = { mensagens: [msg(me, text)], maisAnteriores: false, bloqueada: false }
    const before = loaderCalls
    await user.click(within(dialog()).getByRole('button', { name: 'enviar' }))
    const log = await within(dialog()).findByRole('log')
    await waitFor(() => expect(within(log).getByText(text)).toBeTruthy())
    expect(log.querySelector('b')).toBeNull()
    expect(textbox()).toHaveProperty('value', '')
    const [sent] = posts('/api/chat/enviar')
    expect(Object.fromEntries(sent.body!)).toEqual({ via: `profile:${ME}>profile:${OTHER}`, body: text, request_id: expect.stringMatching(/^[0-9a-f-]{36}$/) })
    // A conversa recém-criada passa a existir na janela e o link da tela completa aparece.
    expect(within(dialog()).getByRole('link', { name: 'abrir conversa completa' }).getAttribute('href')).toBe(`/painel/mensagens/${CONV}`)
    await waitFor(() => expect(loaderCalls).toBeGreaterThan(before))
  })

  it('Enter envia; Shift+Enter quebra a linha', async () => {
    const { user } = await openWindow()
    await user.type(textbox(), 'linha 1{Shift>}{Enter}{/Shift}linha 2')
    expect(posts('/api/chat/enviar')).toEqual([])
    server.threads[CONV] = { mensagens: [msg(me, 'linha 1\nlinha 2')], maisAnteriores: false, bloqueada: false }
    await user.type(textbox(), '{Enter}')
    await waitFor(() => expect(posts('/api/chat/enviar')).toHaveLength(1))
    expect(posts('/api/chat/enviar')[0].body!.get('body')).toBe('linha 1\nlinha 2')
  })

  /** Resposta de envio que só sai quando o teste mandar: deixa ver a tela entre "enviar" e a resposta do servidor. */
  const gate = () => {
    let release!: (response: Response) => void
    const promise = new Promise<Response>((resolve) => (release = resolve))
    return { promise, release }
  }
  const bubble = (text: string) => within(dialog()).getByText(text).closest('li')!

  it('envio otimista: a mensagem aparece na hora como "enviando…", o campo limpa antes da resposta e a real a substitui', async () => {
    const { user } = await openWindow()
    const held = gate()
    server.send = () => held.promise
    await user.type(textbox(), 'Oi, tudo bem?')
    await user.click(within(dialog()).getByRole('button', { name: 'enviar' }))
    // Sem esperar o servidor: balão na conversa, marcado, e o campo livre (com o foco de volta nele).
    expect(within(bubble('Oi, tudo bem?')).getByRole('status').textContent).toBe('enviando…')
    expect(textbox()).toHaveProperty('value', '')
    expect(document.activeElement).toBe(textbox())
    expect(within(dialog()).queryByRole('alert')).toBeNull()
    expect(within(dialog()).queryByText('Nenhuma mensagem ainda. Escreva a primeira.')).toBeNull()

    const real = msg(me, 'Oi, tudo bem?')
    server.threads[CONV] = { mensagens: [real], maisAnteriores: false, bloqueada: false }
    held.release(Response.json({ ok: true, message: 'Mensagem enviada.', conversation_id: CONV, message_id: real.id }))
    // A mensagem real entra e o balão em envio sai: uma só mensagem, sem marcação.
    await waitFor(() => expect(within(dialog()).queryByRole('status')).toBeNull())
    expect(within(within(dialog()).getByRole('log')).getAllByText('Oi, tudo bem?')).toHaveLength(1)
  })

  it('várias mensagens seguidas: o campo continua livre, cada uma tem a sua chave e saem na ordem de escrita', async () => {
    const { user } = await openWindow()
    const first = gate()
    server.send = (fields) => (fields.get('body') === 'um' ? first.promise : Response.json({ ok: true, message: 'Mensagem enviada.', conversation_id: CONV }))
    await user.type(textbox(), 'um{Enter}')
    await user.type(textbox(), 'dois{Enter}')
    expect(within(dialog()).getAllByRole('status').map((s) => s.textContent)).toEqual(['enviando…', 'enviando…'])
    expect(textbox()).toHaveProperty('value', '')
    // A segunda espera a primeira: a ordem no banco é a ordem em que o usuário escreveu.
    await waitFor(() => expect(posts('/api/chat/enviar')).toHaveLength(1))
    expect(posts('/api/chat/enviar')[0].body!.get('body')).toBe('um')
    server.threads[CONV] = { mensagens: [msg(me, 'um'), msg(me, 'dois')], maisAnteriores: false, bloqueada: false }
    first.release(Response.json({ ok: true, message: 'Mensagem enviada.', conversation_id: CONV }))
    await waitFor(() => expect(posts('/api/chat/enviar')).toHaveLength(2))
    const [a, b] = posts('/api/chat/enviar').map((r) => r.body!.get('request_id'))
    expect(a).toMatch(/^[0-9a-f-]{36}$/)
    expect(b).not.toBe(a)
    await waitFor(() => expect(within(dialog()).queryByRole('status')).toBeNull())
  })

  it('falha de rede: o balão fica com "mensagem não enviada"; "tentar de novo" reenvia com a mesma chave e o mesmo texto', async () => {
    const { user } = await openWindow()
    server.send = () => {
      throw new TypeError('Failed to fetch')
    }
    await user.type(textbox(), 'Mensagem importante')
    await user.click(within(dialog()).getByRole('button', { name: 'enviar' }))
    const alert = await within(dialog()).findByRole('alert')
    expect(alert.textContent).toContain('mensagem não enviada')
    expect(alert.textContent).toContain('Sem conexão')
    expect(within(dialog()).getByText('Mensagem importante')).toBeTruthy()
    expect(textbox()).toHaveProperty('value', '')

    const real = msg(me, 'Mensagem importante')
    server.threads[CONV] = { mensagens: [real], maisAnteriores: false, bloqueada: false }
    server.send = () => Response.json({ ok: true, message: 'Mensagem enviada.', conversation_id: CONV, message_id: real.id })
    await user.click(within(dialog()).getByRole('button', { name: /^tentar de novo: enviar "Mensagem importante"/ }))
    expect(within(dialog()).queryByRole('alert')).toBeNull()
    await waitFor(() => expect(posts('/api/chat/enviar')).toHaveLength(2))
    const [a, b] = posts('/api/chat/enviar').map((r) => Object.fromEntries(r.body!))
    expect(b).toEqual(a)
    await waitFor(() => expect(within(dialog()).queryByText('mensagem não enviada')).toBeNull())
    expect(within(within(dialog()).getByRole('log')).getAllByText('Mensagem importante')).toHaveLength(1)
  })

  it('"descartar" tira a mensagem que falhou da conversa, sem enviar nada', async () => {
    const { user } = await openWindow()
    server.send = () => Response.json({ ok: false, error: 'Não foi possível concluir a operação. Tente novamente.' }, { status: 503 })
    await user.type(textbox(), 'Desisti')
    await user.click(within(dialog()).getByRole('button', { name: 'enviar' }))
    expect((await within(dialog()).findByRole('alert')).textContent).toContain('mensagem não enviada')
    await user.click(within(dialog()).getByRole('button', { name: /^descartar a mensagem não enviada "Desisti"/ }))
    expect(within(dialog()).queryByText('Desisti')).toBeNull()
    expect(within(dialog()).queryByRole('alert')).toBeNull()
    expect(posts('/api/chat/enviar')).toHaveLength(1)
  })

  it('recusa do banco (bloqueio): "mensagem não enviada" com o motivo, sem "tentar de novo", e a conversa é relida', async () => {
    server.open = withHistory([msg(other, 'Oi')])
    const { user } = await openWindow()
    await within(dialog()).findByRole('log')
    server.send = () => Response.json({ ok: false, error: 'Esta conversa está bloqueada: ninguém pode enviar mensagens enquanto o bloqueio durar.' }, { status: 409 })
    server.threads[CONV] = { mensagens: [msg(other, 'Oi')], maisAnteriores: false, bloqueada: true }
    await user.type(textbox(), 'Não deve passar')
    await user.click(within(dialog()).getByRole('button', { name: 'enviar' }))
    const alert = await within(dialog()).findByRole('alert')
    expect(alert.textContent).toContain('mensagem não enviada')
    expect(alert.textContent).toContain('Esta conversa está bloqueada')
    expect(within(dialog()).getByText('Não deve passar')).toBeTruthy()
    // Tentar de novo não adianta: só descartar.
    expect(within(dialog()).queryByRole('button', { name: /tentar de novo/ })).toBeNull()
    expect(within(dialog()).getByRole('button', { name: /^descartar/ })).toBeTruthy()
    // A leitura seguinte trouxe o bloqueio: o campo vira somente leitura e o envio fica desligado.
    await waitFor(() => expect(textbox().hasAttribute('readonly')).toBe(true))
    expect(within(dialog()).getByText(/Conversa bloqueada: ninguém envia mensagens/)).toBeTruthy()
    expect(within(dialog()).getByRole('button', { name: 'enviar' })).toHaveProperty('disabled', true)
  })

  it('"Enviar como" aparece quando há mais de uma ponta e o envio usa a escolhida', async () => {
    server.open = emptyOpen({ remetentes: [me, me2, col] })
    const { user } = await openWindow()
    const select = await within(dialog()).findByRole('combobox', { name: 'Enviar como' })
    expect(within(select).getAllByRole('option').map((o) => o.textContent)).toEqual(['Minha atuação', 'Outro projeto meu', 'Organização 1'])
    await user.selectOptions(select, 'Organização 1')
    await user.type(textbox(), 'Olá do coletivo')
    server.threads[CONV2] = { mensagens: [msg(col, 'Olá do coletivo')], maisAnteriores: false, bloqueada: false }
    server.send = () => Response.json({ ok: true, message: 'Mensagem enviada.', conversation_id: CONV2 })
    await user.click(within(dialog()).getByRole('button', { name: 'enviar' }))
    await waitFor(() => expect(posts('/api/chat/enviar')).toHaveLength(1))
    expect(posts('/api/chat/enviar')[0].body!.get('via')).toBe(`collective:${C}>profile:${OTHER}`)
    // Conversa de coletivo abre na área do coletivo.
    expect((await within(dialog()).findByRole('link', { name: 'abrir conversa completa' })).getAttribute('href')).toBe(`/coletivo/${C}/mensagens/${CONV2}`)
  })

  it('sem nenhuma atuação que possa enviar: explica, campo somente leitura e envio desligado', async () => {
    server.open = emptyOpen({ remetentes: [] })
    await openWindow()
    expect(await within(dialog()).findByText(/Você não tem uma atuação ou coletivo que possa enviar mensagens para Interlocutor/)).toBeTruthy()
    expect(textbox().hasAttribute('readonly')).toBe(true)
    expect(within(dialog()).getByRole('button', { name: 'enviar' })).toHaveProperty('disabled', true)
  })
})

describe('erros de leitura', () => {
  it('interlocutor indisponível: mensagem no alerta e "tentar de novo" refaz a leitura', async () => {
    server.open = { status: 404, error: 'Interlocutor não encontrado.' }
    const { user } = await openWindow()
    expect((await within(dialog()).findByRole('alert')).textContent).toContain('Interlocutor não encontrado.')
    expect(textbox().hasAttribute('readonly')).toBe(true)
    server.open = emptyOpen()
    await user.click(within(dialog()).getByRole('button', { name: 'tentar de novo' }))
    expect(await within(dialog()).findByText('Nenhuma mensagem ainda. Escreva a primeira.')).toBeTruthy()
  })

  it('sessão vencida (401): oferece entrar de novo', async () => {
    server.open = { status: 401, error: 'Sua sessão expirou. Entre novamente para continuar.' }
    await openWindow()
    expect((await within(dialog()).findByRole('link', { name: 'entrar novamente' })).getAttribute('href')).toBe('/entrar')
  })

  it('falha de rede vira mensagem na janela, nunca uma navegação', async () => {
    vi.mocked(fetch).mockRejectedValue(new TypeError('Failed to fetch'))
    const { router } = await openWindow()
    expect((await within(dialog()).findByRole('alert')).textContent).toContain('Sem conexão')
    expect(router.state.location.pathname).toBe('/')
  })
})

describe('Esc, minimizar, fechar e foco', () => {
  it('Esc minimiza e devolve o foco ao botão que abriu; a barra reabre e o foco volta ao campo', async () => {
    const { user, link } = await openWindow()
    await within(dialog()).findByText('Nenhuma mensagem ainda. Escreva a primeira.')
    await user.type(textbox(), 'rascunho')
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(document.activeElement).toBe(link)
    const bar = screen.getByRole('button', { name: 'Abrir conversa com Interlocutor' })
    expect(bar.getAttribute('aria-expanded')).toBe('false')
    await user.click(bar)
    expect(textbox()).toHaveProperty('value', 'rascunho')
    expect(document.activeElement).toBe(textbox())
    // Reabrir pela barra não repete a leitura inicial.
    expect(requests.filter((r) => r.url.startsWith('/api/chat/abrir'))).toHaveLength(1)
  })

  it('o botão minimizar leva o foco à barra; fechar remove a janela e não deixa nada guardado', async () => {
    const { user } = await openWindow()
    await user.click(within(dialog()).getByRole('button', { name: /^Minimizar conversa com/ }))
    const bar = screen.getByRole('button', { name: 'Abrir conversa com Interlocutor' })
    expect(document.activeElement).toBe(bar)
    await user.click(screen.getByRole('button', { name: 'Fechar conversa com Interlocutor' }))
    expect(screen.queryByRole('button', { name: /conversa com Interlocutor/ })).toBeNull()
    await waitFor(() => expect(window.sessionStorage.getItem(CHAT_STORAGE_KEY)).toBeNull())
  })

  it('Esc com o foco no botão de minimizar também minimiza; se o botão de origem sumiu, o foco vai à barra', async () => {
    const { user, router } = await openWindow()
    await within(dialog()).findByText('Nenhuma mensagem ainda. Escreva a primeira.')
    // Navegação no cliente: a janela continua e o link de origem deixa de existir.
    await act(async () => {
      await router.navigate('/outra')
    })
    expect(screen.getByRole('heading', { name: 'Outra página' })).toBeTruthy()
    expect(screen.getByRole('dialog')).toBeTruthy()
    within(dialog()).getByRole('button', { name: /^Minimizar conversa com/ }).focus()
    await user.keyboard('{Escape}')
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Abrir conversa com Interlocutor' }))
  })

  it('o estado sobrevive à navegação e à recarga da aba (restaurado sem roubar o foco)', async () => {
    const { user, router } = await openWindow()
    await within(dialog()).findByText('Nenhuma mensagem ainda. Escreva a primeira.')
    await act(async () => {
      await router.navigate('/outra')
    })
    expect(screen.getByRole('dialog')).toBeTruthy()
    expect(JSON.parse(window.sessionStorage.getItem(CHAT_STORAGE_KEY)!)).toEqual([{ para: PARA, nome: 'Interlocutor', minimized: false }])
    // "Recarregar": nova árvore com o mesmo sessionStorage.
    document.body.innerHTML = ''
    const again = render(<div />)
    again.unmount()
    requests = []
    setup({ initial: '/outra' })
    await screen.findByRole('dialog')
    await within(dialog()).findByText('Nenhuma mensagem ainda. Escreva a primeira.')
    expect(document.activeElement).not.toBe(textbox())
    expect(user).toBeTruthy()
  })

  it('armazenamento quebrado (JSON inválido, sessionStorage bloqueado) não derruba a página', async () => {
    window.sessionStorage.setItem(CHAT_STORAGE_KEY, '{quebrado')
    setup()
    await screen.findAllByRole('link', { name: 'Enviar mensagem' })
    expect(screen.queryByRole('dialog')).toBeNull()
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('bloqueado')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('bloqueado')
    })
    const user = userEvent.setup()
    await user.click(opener())
    expect(await screen.findByRole('dialog')).toBeTruthy()
  })

  it('abrir outro interlocutor minimiza o primeiro: só uma janela fica expandida', async () => {
    const user = userEvent.setup()
    setup()
    const links = await screen.findAllByRole('link', { name: 'Enviar mensagem' })
    await user.click(links[0])
    await screen.findByRole('dialog')
    server.open = emptyOpen({ destinatario: col, remetentes: [me] })
    await user.click(links[1])
    await waitFor(() => expect(screen.getAllByRole('dialog')).toHaveLength(1))
    expect(screen.getAllByRole('button', { name: /^Abrir conversa com/ })).toHaveLength(1)
  })
})

describe('atualização periódica e leitura', () => {
  it('a cada ~15 s lê a conversa, acrescenta o que chegou, marca como lida e atualiza o menu', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    server.open = withHistory([msg(other, 'Oi')])
    const first = server.open.inicial!.mensagens
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    setup()
    await user.click((await screen.findAllByRole('link', { name: 'Enviar mensagem' }))[0])
    await within(dialog()).findByRole('log')
    expect(requests.some((r) => r.url.startsWith('/api/chat/conversa'))).toBe(false)
    expect(posts('/api/chat/lida')).toEqual([])

    const arrived = msg(other, 'Mensagem nova do outro lado')
    server.threads[CONV] = { mensagens: [...first, arrived], maisAnteriores: false, bloqueada: false }
    const before = loaderCalls
    await act(async () => {
      await vi.advanceTimersByTimeAsync(REFRESH_INTERVAL_MS + 100)
    })
    expect(await within(dialog()).findByText('Mensagem nova do outro lado')).toBeTruthy()
    await waitFor(() => expect(posts('/api/chat/lida')).toHaveLength(1))
    expect(Object.fromEntries(posts('/api/chat/lida')[0].body!)).toEqual({ conversation: CONV, last: arrived.id })
    await waitFor(() => expect(loaderCalls).toBeGreaterThan(before))
    // Mensagens que já estavam na tela não se duplicam.
    expect(within(dialog()).getAllByText('Oi')).toHaveLength(1)
  })

  it('ao abrir uma conversa com não lidas, marca como lida de uma vez (janela aberta e aba visível)', async () => {
    server.open = withHistory([msg(other, 'Oi'), msg(other, 'Tem alguém aí?')])
    server.open.conversas = [conversa(CONV, me, { naoLidas: 2 })]
    await openWindow()
    await waitFor(() => expect(posts('/api/chat/lida')).toHaveLength(1))
    expect(posts('/api/chat/lida')[0].body!.get('last')).toMatch(/^0e000000/)
  })

  it('janela minimizada não consulta nem marca nada como lido', async () => {
    window.sessionStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify([{ para: PARA, nome: 'Interlocutor', minimized: true }]))
    setup()
    expect(await screen.findByRole('button', { name: 'Abrir conversa com Interlocutor' })).toBeTruthy()
    expect(requests).toEqual([])
  })

  it('"carregar anteriores" busca a página anterior pelo cursor e mantém a ordem', async () => {
    const older = [msg(other, 'antiga 1')]
    const recent = [msg(other, 'recente 1'), msg(me, 'recente 2')]
    server.open = withHistory(recent, { maisAnteriores: true })
    server.threads[CONV] = { mensagens: older, maisAnteriores: false, bloqueada: false }
    const { user } = await openWindow()
    await user.click(await within(dialog()).findByRole('button', { name: 'carregar anteriores' }))
    await within(dialog()).findByText('antiga 1')
    const url = requests.find((r) => r.url.includes('antes_t='))!.url
    expect(decodeURIComponent(url)).toContain(`antes_t=${recent[0].cursor}&antes_id=${recent[0].id}`)
    expect(within(dialog()).queryByRole('button', { name: 'carregar anteriores' })).toBeNull()
    expect(within(dialog()).getAllByRole('listitem')[0].textContent).toContain('antiga 1')
  })
})

describe('acessibilidade da janela', () => {
  it('controles têm nome, o texto das mensagens é texto puro e não há botão de denúncia aqui', async () => {
    server.open = withHistory([msg(other, '<img src=x onerror="window.__pwned=1"> **md**')])
    await openWindow()
    const log = await within(dialog()).findByRole('log')
    expect(within(log).getByText('<img src=x onerror="window.__pwned=1"> **md**')).toBeTruthy()
    expect(log.querySelector('img')).toBeNull()
    expect(within(dialog()).queryByText('denunciar')).toBeNull()
    for (const button of within(dialog()).getAllByRole('button')) expect((button.getAttribute('aria-label') ?? button.textContent ?? '').trim()).not.toBe('')
    // O registro rolável é alcançável por teclado e as mensagens ficam em uma lista dentro dele.
    expect(log.getAttribute('tabindex')).toBe('0')
    expect(within(log).getByRole('list')).toBeTruthy()
  })
})
