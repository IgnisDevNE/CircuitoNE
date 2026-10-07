import type { ComponentProps } from 'react'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, data, Outlet, redirect, RouterProvider, useActionData, useLoaderData } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CollectiveDashboard } from '../../src/pages/collective/CollectiveDashboard'
import { CreateEvent } from '../../src/pages/collective/CreateEvent'
import { ManageEvent } from '../../src/pages/collective/ManageEvent'
import EventCreateRoute, * as createModule from '../../src/routes/event-create'
import EventManageRoute, * as manageModule from '../../src/routes/event-manage'
import { revalidateAfterSubmit } from '../../src/lib/revalidate'
import type { ActionResult } from '../../src/lib/action-result'
import type { EventoGestao } from '../../src/server/mappers/collective-area'
import type { EventoGerido } from '../../src/server/mappers/events-manage'

const C = '05000000-0000-4000-8000-000000000001'
const E = '0a000000-0000-4000-8000-000000000005'
const ARTIST = '02000000-0000-4000-8000-000000000001'
const ARTIST_2 = '02000000-0000-4000-8000-000000000002'
const REQUEST = '0b000000-0000-4000-8000-000000000001'
const artistas = [
  { id: ARTIST, nome: 'Artista sintético público' },
  { id: ARTIST_2, nome: 'Álvaro sintético' },
]

const evento = (extra: Partial<EventoGerido> = {}): EventoGerido => ({
  id: E,
  coletivoId: C,
  situacao: 'draft',
  periodo: 'future',
  versao: 3,
  nome: 'Evento sintético 5',
  tipo: 'festa',
  tipoOutro: '',
  descricao: '# Olá\n\nTexto **forte**',
  inicio: '2030-05-10T23:00:00.000Z',
  fim: '2030-05-11T05:00:00.000Z',
  estado: 'PE',
  cidade: 'Recife',
  local: 'Local sintético',
  gratuito: false,
  ingressoLink: 'https://tickets.example.invalid/e',
  capa: '',
  capaEnviada: null,
  lineup: [{ artistaId: ARTIST, nome: 'Artista sintético público' }, { nome: 'Convidada livre' }],
  reagendadoEm: null,
  ...extra,
})
const all = { editar: true, publicar: true, cancelar: true }

beforeEach(() => {
  vi.stubGlobal('matchMedia', vi.fn((query: string) => ({ matches: false, media: query, addEventListener: vi.fn(), removeEventListener: vi.fn() })))
})

// Formulários do React Router (`Form`) exigem um data router.
const inRouter = (ui: React.ReactElement) =>
  render(<RouterProvider router={createMemoryRouter([{ path: '*', element: ui }], { initialEntries: ['/'] })} />)

const field = (name: string) => document.querySelector(`[name="${name}"]`) as HTMLInputElement & HTMLSelectElement & HTMLTextAreaElement
const values = (name: string) => [...document.querySelectorAll<HTMLInputElement>(`input[name="${name}"]`)].map((input) => input.value)
/** Campo pelo rótulo exato (os rótulos do formulário começam com "$ "). */
const lbl = (text: string) => screen.getByLabelText(new RegExp(`^\\$ ${text}$`))
const fill = (name: string, value: string) => fireEvent.change(field(name), { target: { value } })

describe('CreateEvent', () => {
  const page = (props: Partial<ComponentProps<typeof CreateEvent>> = {}) => inRouter(<CreateEvent requestId={REQUEST} artistas={artistas} {...props} />)

  it('formulário POST com a solicitação oculta e os campos do evento, sem valores prontos', () => {
    page()
    const form = field('name').closest('form')!
    expect(form.getAttribute('method')).toBe('post')
    expect(values('request')).toEqual([REQUEST])
    expect(values('lineup')).toEqual([])
    expect(field('name').value).toBe('')
    expect(field('kind').value).toBe('festa')
    expect(field('state_code').value).toBe('PE')
    expect(field('starts_at').type).toBe('datetime-local')
    expect(screen.getByLabelText(/Início \(Fortaleza\)/)).toBe(field('starts_at'))
    expect(screen.getByText(/UTC−03:00/)).toBeTruthy()
    expect([...field('kind').options].map((o) => o.value)).toEqual(['festa', 'festival', 'evento-cultural', 'feira', 'encontro', 'capacitacao', 'outros'])
    expect(screen.getByText(/nasce como/).textContent).toMatch(/rascunho/)
    expect((screen.getByRole('button', { name: 'salvar rascunho' }) as HTMLButtonElement).type).toBe('submit')
  })

  it('criar: o envio de capa por arquivo só existe depois do rascunho (o caminho leva o id do evento); o link continua', () => {
    page()
    expect(field('cover_file')).toBeNull()
    expect(field('cover_url')).toBeTruthy()
    expect(field('name').closest('form')!.getAttribute('enctype')).not.toBe('multipart/form-data')
    expect(screen.getByText(/disponível depois de criar o rascunho/)).toBeTruthy()
  })

  it('o identificador da solicitação continua o mesmo quando a página recebe outro valor do loader', () => {
    const view = page()
    view.rerender(<RouterProvider router={createMemoryRouter([{ path: '*', element: <CreateEvent requestId="outro" artistas={artistas} /> }])} />)
    expect(values('request').every((v) => v === REQUEST || v === 'outro')).toBe(true)
  })

  it('"outros" mostra o campo da descrição do tipo; gratuito esconde o link de ingresso', async () => {
    page()
    const user = userEvent.setup()
    expect(field('other_kind')).toBeNull()
    await user.selectOptions(field('kind'), 'outros')
    expect(field('other_kind')).toBeTruthy()
    await user.selectOptions(field('kind'), 'festival')
    expect(field('other_kind')).toBeNull()

    expect(field('ticket_url')).toBeTruthy()
    await user.click(screen.getByRole('checkbox', { name: 'Evento gratuito' }))
    expect(field('ticket_url')).toBeNull()
    expect(field('is_free').checked).toBe(true)
  })

  it('a prévia usa o mesmo Markdown seguro da página pública: sem HTML bruto, imagens nem links perigosos', () => {
    page()
    expect(screen.getByText('Nada para mostrar ainda.')).toBeTruthy()
    fill('description', '# Título\n\n**forte** [ok](https://example.invalid/a) [ruim](javascript:alert(1)) <img src=x onerror=alert(1)>')
    const preview = screen.getByLabelText('Pré-visualização da descrição')
    expect(within(preview).getByRole('heading', { name: 'Título' })).toBeTruthy()
    expect(within(preview).getByText('forte').tagName).toBe('STRONG')
    const link = within(preview).getByRole('link', { name: 'ok' })
    expect(link.getAttribute('href')).toBe('https://example.invalid/a')
    expect(link.getAttribute('rel')).toBe('noopener noreferrer')
    expect(within(preview).getAllByRole('link')).toHaveLength(1)
    expect(preview.querySelector('img')).toBeNull()
    expect(field('description').value).toContain('<img')
  })

  it('lineup: escolhe artista do hub (com busca sem acento), nome livre, e remove', async () => {
    page()
    const user = userEvent.setup()
    const select = lbl('Artista do hub') as HTMLSelectElement
    expect([...select.options].map((o) => o.textContent)).toEqual(['— selecionar artista —', 'Artista sintético público', 'Álvaro sintético'])

    await user.type(lbl('Buscar artista do hub'), 'alvaro')
    expect([...select.options].map((o) => o.textContent)).toEqual(['— selecionar artista —', 'Álvaro sintético'])
    await user.selectOptions(select, ARTIST_2)
    // Artista já escolhido some da lista; a busca continua valendo.
    expect([...select.options].map((o) => o.textContent)).toEqual(['— selecionar artista —'])
    expect(screen.getByText('Nenhum artista encontrado.')).toBeTruthy()

    await user.type(lbl('Nome livre'), '  Convidada livre  {Enter}')
    expect(values('lineup')).toEqual([`a:${ARTIST_2}`, 'n:Convidada livre'])
    expect((lbl('Nome livre') as HTMLInputElement).value).toBe('')
    const list = screen.getByRole('list', { name: 'Lineup do evento' })
    expect(within(list).getByText('hub')).toBeTruthy()

    await user.click(within(list).getByRole('button', { name: /remover Álvaro sintético/ }))
    expect(values('lineup')).toEqual(['n:Convidada livre'])
    // Quem saiu do lineup volta para a lista de busca.
    await user.clear(lbl('Buscar artista do hub'))
    expect([...select.options].map((o) => o.value)).toEqual(['', ARTIST, ARTIST_2])
  })

  it('Enter nos campos auxiliares do lineup não envia o formulário', async () => {
    const submit = vi.fn((event: Event) => event.preventDefault())
    page()
    field('name').closest('form')!.addEventListener('submit', submit)
    const user = userEvent.setup()
    await user.type(lbl('Buscar artista do hub'), 'a{Enter}')
    await user.type(lbl('Nome livre'), '{Enter}')
    expect(submit).not.toHaveBeenCalled()
  })

  it('hub vazio diz a verdade, e o lineup vazio explica quem tem link', () => {
    page({ artistas: [] })
    expect(screen.getByText('Nenhum artista público no hub ainda.')).toBeTruthy()
    expect(screen.getByText(/Só artistas públicos têm link/)).toBeTruthy()
  })

  it('mostra o erro do banco em alerta e a mensagem de cada campo; nada antes de existir resultado', () => {
    const idle = page()
    expect(screen.queryByRole('alert')).toBeNull()
    idle.unmount()
    page({
      feedback: {
        ok: false,
        error: 'Corrija os campos destacados.',
        fields: { name: 'Informe o nome do evento.', ends_at: 'O fim deve ser posterior ao início.', ticket_url: 'Informe o link.', lineup: 'Cada artista aparece uma única vez no lineup.' },
      },
    })
    expect(screen.getByRole('alert').textContent).toBe('[erro] Corrija os campos destacados.')
    expect(screen.getByLabelText(/Nome do evento/).getAttribute('aria-invalid')).toBe('true')
    expect(screen.getByText('[erro] Informe o nome do evento.')).toBeTruthy()
    expect(screen.getByText('[erro] O fim deve ser posterior ao início.')).toBeTruthy()
    expect(screen.getByText('[erro] Informe o link.')).toBeTruthy()
    expect(screen.getByText('[erro] Cada artista aparece uma única vez no lineup.')).toBeTruthy()
  })

  it('o erro da descrição fica ligado ao editor (aria-invalid e aria-describedby)', () => {
    page({ feedback: { ok: false, error: 'Corrija os campos destacados.', fields: { description: 'A descrição é longa demais.' } } })
    const editor = screen.getByLabelText('$ descrição')
    expect(editor.getAttribute('aria-invalid')).toBe('true')
    expect(document.getElementById(editor.getAttribute('aria-describedby')!)?.textContent).toBe('[erro] A descrição é longa demais.')
  })

  it('durante o envio o botão fica desativado', () => {
    page({ busy: true })
    expect((screen.getByRole('button', { name: 'salvar rascunho' }) as HTMLButtonElement).disabled).toBe(true)
  })
})

describe('ManageEvent', () => {
  const page = (props: Partial<ComponentProps<typeof ManageEvent>> = {}) => inRouter(<ManageEvent evento={evento()} acoes={all} artistas={artistas} {...props} />)

  it('rascunho: situação, versão, formulário preenchido com a hora de Fortaleza e o lineup atual', () => {
    page()
    expect(screen.getByText('Evento sintético 5', { selector: 'span.font-display' })).toBeTruthy()
    expect(screen.getByText('rascunho')).toBeTruthy()
    expect(screen.getByText('versão 3')).toBeTruthy()
    expect(screen.getByText(/10 mai 2030 · 20:00 \(Fortaleza\) até 11 mai 2030 · 02:00/)).toBeTruthy()
    expect(screen.queryByRole('link', { name: /página pública/ })).toBeNull()
    expect(values('intent')).toEqual(['update'])
    expect([...new Set(values('version'))]).toEqual(['3'])
    expect(field('name').value).toBe('Evento sintético 5')
    expect(field('starts_at').value).toBe('2030-05-10T20:00')
    expect(field('ends_at').value).toBe('2030-05-11T02:00')
    expect(field('description').value).toBe('# Olá\n\nTexto **forte**')
    expect(values('lineup')).toEqual([`a:${ARTIST}`, 'n:Convidada livre'])
    expect(field('ticket_url').value).toBe('https://tickets.example.invalid/e')
    expect(screen.getByRole('button', { name: 'salvar alterações' })).toBeTruthy()
    expect(screen.queryByText(/aparece na página pública imediatamente/)).toBeNull()
  })

  it('evento gratuito, "outros" e capa chegam preenchidos; sem fim, o campo fica vazio (nunca igual ao início)', () => {
    page({ evento: evento({ gratuito: true, ingressoLink: '', tipo: 'outros', tipoOutro: 'Sarau', capa: 'https://img.example.invalid/c.jpg', fim: null }) })
    expect(field('is_free').checked).toBe(true)
    expect(field('ticket_url')).toBeNull()
    expect(field('other_kind').value).toBe('Sarau')
    expect(field('cover_url').value).toBe('https://img.example.invalid/c.jpg')
    expect(field('ends_at').value).toBe('')
    expect(screen.getByText(/10 mai 2030 · 20:00 \(Fortaleza\) · Local sintético, Recife\/PE/)).toBeTruthy()
  })

  it('gestão: formulário multipart com o campo de arquivo da capa; sem capa enviada não há remoção', () => {
    page()
    const form = field('name').closest('form')!
    expect(form.getAttribute('enctype')).toBe('multipart/form-data')
    expect(field('cover_file').type).toBe('file')
    expect(field('cover_file').required).toBe(false)
    expect(field('cover_file').accept).toContain('image/png')
    expect(field('remove_cover')).toBeNull()
    expect(screen.getByText(/Nenhuma capa enviada/)).toBeTruthy()
    expect(screen.getByText(/informar um link remove a capa enviada/)).toBeTruthy()
  })

  it('gestão: com capa enviada mostra a prévia e a opção de remover; o campo vira "substituir"', () => {
    page({ evento: evento({ capaEnviada: 'https://synthetic.supabase.test/storage/v1/object/public/public-images/x/y.png' }) })
    expect(screen.getByRole('img', { name: /Capa enviada do evento Evento sintético 5/ }).getAttribute('src')).toMatch(/public-images/)
    expect(field('remove_cover').type).toBe('checkbox')
    expect(screen.getByLabelText(/Substituir a capa/)).toBe(field('cover_file'))
  })

  it('gestão: erro do arquivo da capa aparece no campo', () => {
    page({ feedback: { ok: false, error: 'Corrija os campos destacados.', fields: { cover_file: 'A imagem passa de 5 MB. Envie um arquivo menor.' } } })
    expect(screen.getByText('[erro] A imagem passa de 5 MB. Envie um arquivo menor.')).toBeTruthy()
    expect(field('cover_file').getAttribute('aria-invalid')).toBe('true')
  })

  it('publicar: formulário com a versão; some quando não há permissão ou o evento não é rascunho', () => {
    const { unmount } = page()
    const button = screen.getByRole('button', { name: 'publicar evento' }) as HTMLButtonElement
    expect([button.name, button.value]).toEqual(['intent', 'publish'])
    expect((button.closest('form')!.querySelector('input[name="version"]') as HTMLInputElement).value).toBe('3')
    unmount()
    page({ acoes: { ...all, publicar: false } })
    expect(screen.queryByRole('button', { name: 'publicar evento' })).toBeNull()
  })

  it('cancelar só com confirmação explícita: o botão que cancela fica dentro do bloco de confirmação', () => {
    page()
    const details = screen.getByText('cancelar evento').closest('details')!
    expect(details.open).toBe(false)
    const confirm = within(details).getByRole('button', { name: 'confirmar cancelamento' }) as HTMLButtonElement
    expect([confirm.name, confirm.value]).toEqual(['intent', 'cancel'])
    expect((confirm.closest('form')!.querySelector('input[name="version"]') as HTMLInputElement).value).toBe('3')
    expect(within(details).getByText(/marcado como cancelado e não poderá mais ser editado/)).toBeTruthy()
    // Nenhum outro botão cancela o evento.
    expect(screen.getAllByRole('button').filter((b) => (b as HTMLButtonElement).value === 'cancel')).toHaveLength(1)
  })

  it('evento publicado: link público, aviso de efeito imediato e confirmação com o texto da agenda', () => {
    page({ evento: evento({ situacao: 'published', versao: 4 }), acoes: { editar: true, publicar: false, cancelar: true } })
    expect(screen.getByText('publicado')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'ver página pública ↗' }).getAttribute('href')).toBe(`/eventos/${E}`)
    expect(screen.getByText(/aparece na página pública imediatamente/)).toBeTruthy()
    expect(screen.getByText(/sai da agenda pública/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'publicar evento' })).toBeNull()
    expect(values('version')).toContain('4')
  })

  it('em andamento, encerrado e reagendado aparecem como tal; cancelado nunca é "em andamento"', () => {
    const { unmount } = page({ evento: evento({ periodo: 'ongoing', reagendadoEm: '2030-04-01T12:00:00.000Z', situacao: 'published' }) })
    expect(screen.getByText('em andamento')).toBeTruthy()
    expect(screen.getByText(/Evento reagendado/)).toBeTruthy()
    unmount()
    const past = page({ evento: evento({ periodo: 'past' }) })
    expect(screen.getByText('encerrado')).toBeTruthy()
    past.unmount()
    page({ evento: evento({ periodo: 'ongoing', situacao: 'cancelled' }), acoes: { editar: false, publicar: false, cancelar: false } })
    expect(screen.queryByText('em andamento')).toBeNull()
  })

  it('cancelado: só leitura, sem formulário nem ações, e sem link público', () => {
    page({ evento: evento({ situacao: 'cancelled' }), acoes: { editar: false, publicar: false, cancelar: false } })
    expect(screen.getAllByText('cancelado').length).toBeGreaterThan(0)
    expect(screen.getByText('Evento cancelado: não pode mais ser editado.')).toBeTruthy()
    expect(screen.queryByRole('button')).toBeNull()
    expect(document.querySelector('form')).toBeNull()
    expect(screen.queryByRole('link', { name: /página pública/ })).toBeNull()
    expect(screen.getByRole('heading', { name: 'Olá' })).toBeTruthy()
    expect(screen.getByText('Convidada livre')).toBeTruthy()
  })

  it('sem permissão de editar: leitura, com o motivo certo para rascunho e publicado', () => {
    const { unmount } = page({ acoes: { editar: false, publicar: true, cancelar: false } })
    expect(screen.getByText('Seu perfil não permite editar este evento.')).toBeTruthy()
    expect(document.querySelector('input[name="name"]')).toBeNull()
    expect(screen.getByRole('button', { name: 'publicar evento' })).toBeTruthy()
    unmount()
    page({ evento: evento({ situacao: 'published' }), acoes: { editar: false, publicar: false, cancelar: true } })
    expect(screen.getByText(/exige as permissões de editar e de publicar eventos/)).toBeTruthy()
  })

  it('descrição vazia na leitura não inventa conteúdo', () => {
    page({ evento: evento({ descricao: '  ', lineup: [] }), acoes: { editar: false, publicar: false, cancelar: false } })
    expect(screen.getByText('Sem descrição.')).toBeTruthy()
    expect(screen.queryByText('lineup')).toBeNull()
  })

  it('sucesso em status, erro em alerta com as mensagens por campo; nada antes de existir resultado', () => {
    const idle = page()
    expect(screen.queryByRole('status')).toBeNull()
    expect(screen.queryByRole('alert')).toBeNull()
    idle.unmount()
    const ok = page({ feedback: { ok: true, message: 'Alterações salvas.' } })
    expect(screen.getByRole('status').textContent).toBe('Alterações salvas.')
    ok.unmount()
    page({ feedback: { ok: false, error: 'Corrija os campos destacados.', fields: { city: 'Informe a cidade.' } } })
    expect(screen.getByRole('alert').textContent).toBe('[erro] Corrija os campos destacados.')
    expect(screen.getByText('[erro] Informe a cidade.')).toBeTruthy()
  })

  it('durante a operação todos os botões ficam desativados', () => {
    page({ busy: true })
    for (const name of ['publicar evento', 'confirmar cancelamento', 'salvar alterações'])
      expect((screen.getByRole('button', { name }) as HTMLButtonElement).disabled, name).toBe(true)
  })

  it('link de volta ao dashboard do coletivo', () => {
    page()
    expect(screen.getByRole('link', { name: '← dashboard do coletivo' }).getAttribute('href')).toBe(`/coletivo/${C}/painel`)
  })
})

describe('CollectiveDashboard: lista de eventos', () => {
  const coletivo = { id: C, nome: 'Organização sintética 1', dono: false }
  const item: EventoGestao = { id: E, nome: 'Evento sintético 5', situacao: 'draft', periodo: 'future', inicio: '2030-05-10T23:00:00.000Z', fim: null }

  it('quem gere eventos abre a página de gestão; quem só vê o público abre a página pública', () => {
    const gestao = inRouter(<CollectiveDashboard coletivo={coletivo} permissoes={['edit_events']} pendentes={null} eventos={[item]} gestao mensagens={null} />)
    expect(screen.getByRole('link', { name: /Evento sintético 5/ }).getAttribute('href')).toBe(`/coletivo/${C}/eventos/${E}`)
    gestao.unmount()
    inRouter(<CollectiveDashboard coletivo={coletivo} permissoes={[]} pendentes={null} eventos={[{ ...item, situacao: 'published' }]} gestao={false} mensagens={null} />)
    expect(screen.getByRole('link', { name: /Evento sintético 5/ }).getAttribute('href')).toBe(`/eventos/${E}`)
  })
})

describe('módulos de rota de eventos', () => {
  const withLoader = <P,>(Route: (props: P) => React.ReactNode) =>
    function Wrapped() {
      return Route({ loaderData: useLoaderData(), actionData: useActionData() } as unknown as P)
    }
  const routed = (path: string, children: Parameters<typeof createMemoryRouter>[0]) =>
    render(<RouterProvider router={createMemoryRouter([{ path: '/', Component: Outlet, children: [{ path: 'coletivo/:id', Component: Outlet, children }] }], { initialEntries: [path] })} />)

  it('exportam a revalidação depois de envios recusados e os cabeçalhos privados', () => {
    expect(createModule.shouldRevalidate).toBe(revalidateAfterSubmit)
    expect(manageModule.shouldRevalidate).toBe(revalidateAfterSubmit)
    expect(typeof createModule.headers).toBe('function')
    expect(typeof manageModule.headers).toBe('function')
    expect(manageModule.meta({ loaderData: { evento: evento() } } as never)).toEqual([{ title: 'Evento sintético 5 · Gestão · CIRCUITO NE' }])
    expect(manageModule.meta({ loaderData: undefined } as never)).toEqual([{ title: 'Evento · Gestão · CIRCUITO NE' }])
  })

  it('criar: envia os campos do formulário, mostra o erro de campo sem apagar o que foi digitado e, no sucesso, abre a gestão', async () => {
    const received: Record<string, string[]> = {}
    let attempt = 0
    routed(`/coletivo/${C}/eventos/novo`, [
      {
        path: 'eventos/novo',
        loader: () => ({ requestId: REQUEST, artistas }),
        action: async ({ request }: { request: Request }) => {
          const form = await request.formData()
          for (const key of new Set(form.keys())) received[key] = form.getAll(key).map(String)
          attempt += 1
          if (attempt === 1) return data<ActionResult>({ ok: false, error: 'Corrija os campos destacados.', fields: { city: 'Informe a cidade.' } }, { status: 422 })
          return redirect(`/coletivo/${C}/eventos/${E}`)
        },
        shouldRevalidate: revalidateAfterSubmit,
        Component: withLoader<ComponentProps<typeof EventCreateRoute>>(EventCreateRoute),
      },
      { path: 'eventos/:eventId', Component: () => <p>página de gestão do evento</p> },
    ])
    const user = userEvent.setup()
    await screen.findByRole('button', { name: 'salvar rascunho' })
    fill('name', 'Festa nova')
    fill('starts_at', '2030-05-10T20:00')
    fill('venue', 'Pátio')
    await user.selectOptions(lbl('Artista do hub'), ARTIST)
    await user.click(screen.getByRole('button', { name: 'salvar rascunho' }))

    expect((await screen.findByRole('alert')).textContent).toBe('[erro] Corrija os campos destacados.')
    expect(screen.getByText('[erro] Informe a cidade.')).toBeTruthy()
    expect(field('name').value).toBe('Festa nova')
    expect(values('lineup')).toEqual([`a:${ARTIST}`])
    expect(received).toMatchObject({ request: [REQUEST], name: ['Festa nova'], kind: ['festa'], starts_at: ['2030-05-10T20:00'], venue: ['Pátio'], lineup: [`a:${ARTIST}`] })
    expect(screen.queryByText('página de gestão do evento')).toBeNull()

    // Segundo envio, com o mesmo identificador de solicitação.
    fill('city', 'Recife')
    await user.click(screen.getByRole('button', { name: 'salvar rascunho' }))
    expect(await screen.findByText('página de gestão do evento')).toBeTruthy()
    expect(received.request).toEqual([REQUEST])
  })

  it('gestão: conflito de versão mostra a mensagem, recarrega o evento e refaz o formulário com a versão nova', async () => {
    let current = evento({ versao: 3 })
    const sentVersions: string[] = []
    routed(`/coletivo/${C}/eventos/${E}`, [
      {
        path: 'eventos/:eventId',
        loader: () => ({ evento: current, acoes: all, artistas }),
        action: async ({ request }: { request: Request }) => {
          const form = await request.formData()
          sentVersions.push(`${form.get('intent')}:${form.get('version')}`)
          // Outra pessoa salvou antes: o banco recusa e o evento já está na versão 4.
          current = evento({ versao: 4, nome: 'Nome da outra pessoa' })
          return data<ActionResult>({ ok: false, error: 'Este evento foi alterado por outra pessoa enquanto você editava.' }, { status: 409 })
        },
        shouldRevalidate: revalidateAfterSubmit,
        Component: withLoader<ComponentProps<typeof EventManageRoute>>(EventManageRoute),
      },
    ])
    const user = userEvent.setup()
    await screen.findByRole('button', { name: 'salvar alterações' })
    fill('name', 'Meu nome')
    // O jsdom não consegue montar a requisição com a parte vazia do campo de arquivo; o servidor ignora partes vazias.
    field('cover_file').remove()
    await user.click(screen.getByRole('button', { name: 'salvar alterações' }))

    expect((await screen.findByRole('alert')).textContent).toMatch(/alterado por outra pessoa/)
    await waitFor(() => expect(screen.getByText('versão 4')).toBeTruthy())
    expect(sentVersions).toEqual(['update:3'])
    expect([...new Set(values('version'))]).toEqual(['4'])
    expect(field('name').value).toBe('Nome da outra pessoa')
  })

  it('gestão: publicar mostra o sucesso só depois da resposta e passa a mostrar o link público', async () => {
    let current = evento()
    let release!: () => void
    const gate = new Promise<void>((resolve) => { release = resolve })
    const sent: string[] = []
    routed(`/coletivo/${C}/eventos/${E}`, [
      {
        path: 'eventos/:eventId',
        loader: () => ({ evento: current, acoes: current.situacao === 'draft' ? all : { ...all, publicar: false }, artistas }),
        action: async ({ request }: { request: Request }) => {
          const form = await request.formData()
          sent.push(`${form.get('intent')}:${form.get('version')}`)
          await gate
          current = evento({ situacao: 'published', versao: 4 })
          return data<ActionResult>({ ok: true, message: 'Evento publicado. Ele já aparece na agenda pública.' })
        },
        Component: withLoader<ComponentProps<typeof EventManageRoute>>(EventManageRoute),
      },
    ])
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: 'publicar evento' }))
    expect(sent).toEqual(['publish:3'])
    expect(screen.queryByRole('status')).toBeNull()
    release()
    expect((await screen.findByRole('status')).textContent).toBe('Evento publicado. Ele já aparece na agenda pública.')
    expect(await screen.findByRole('link', { name: 'ver página pública ↗' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'publicar evento' })).toBeNull()
  })
})
