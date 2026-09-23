import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

let App: typeof import('../../src/App').default
const fixedTime = new Date('2026-09-22T15:00:00Z')

beforeAll(async () => {
  // Os eventos do mock são criados na importação: fixar o relógio antes dela.
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(fixedTime)
  App = (await import('../../src/App')).default
})

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(fixedTime)
  vi.stubGlobal('matchMedia', vi.fn((query: string) => ({
    matches: query === '(prefers-reduced-motion: reduce)', media: query,
    addEventListener: vi.fn(), removeEventListener: vi.fn(),
  })))
})

function open(path: string) {
  window.history.replaceState({}, '', path)
  render(<App />)
}

describe('jornadas com fixtures — sem prova de Auth, autorização ou persistência', () => {
  it('usa um título principal e títulos de seção na página inicial', () => {
    open('/')
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
    expect(screen.getByRole('heading', { level: 2, name: 'eventos.log' })).toBeTruthy()
    expect(screen.getByRole('heading', { level: 2, name: 'artistas/' })).toBeTruthy()
  })

  it('apresenta compra de ingresso como um único link acessível', () => {
    open('/eventos/ev-porto')
    const ingresso = screen.getByRole('link', { name: 'Comprar ingresso ↗' })
    expect(ingresso.getAttribute('href')).toBe('https://ingressos.exemplo/porto-noturno')
    expect(ingresso.querySelector('button')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Comprar ingresso ↗' })).toBeNull()
  })

  it('busca artistas por nome e bio, combina estilo e recupera o estado vazio', async () => {
    open('/artistas')
    const user = userEvent.setup()
    const search = screen.getByRole('searchbox', { name: 'Buscar' })
    expect(screen.getAllByRole('article')).toHaveLength(4)
    await user.type(search, 'recifense')
    expect(screen.getAllByRole('article')).toHaveLength(1)
    expect(screen.getByRole('heading', { name: 'ANERIE' })).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Dub' }))
    expect(screen.getByText('Nenhum artista encontrado para os filtros atuais.')).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'todos' }))
    await user.clear(search)
    await user.type(search, 'boitatá')
    expect(screen.getByRole('heading', { name: 'BOITATÁ SYSTEM' })).toBeTruthy()
    expect(screen.getAllByRole('article')).toHaveLength(1)
    await user.clear(search)
    expect(screen.getAllByRole('article')).toHaveLength(4)
    await user.click(screen.getByRole('link', { name: 'ANERIE' }))
    expect(window.location.pathname).toBe('/artistas/art-anerie')
    expect(document.title).toBe('ANERIE · CIRCUITO NE')
  })

  it('ordena eventos futuros, filtra por estado e mostra a programação do evento', async () => {
    open('/eventos')
    const user = userEvent.setup()
    const eventNames = () => screen.getAllByRole('heading', { level: 3 }).map(item => item.textContent)
    expect(eventNames()).toEqual(['PORTO NOTURNO — TECHNO NA ORLA', 'ENCONTRO DE SOUND SYSTEMS', 'USINA FESTIVAL 2026'])
    await user.click(screen.getByRole('button', { name: 'CE' }))
    expect(eventNames()).toEqual(['ENCONTRO DE SOUND SYSTEMS', 'USINA FESTIVAL 2026'])
    await user.click(screen.getByRole('button', { name: 'CE' }))
    expect(eventNames()).toHaveLength(3)
    await user.click(screen.getByRole('button', { name: 'PE' }))
    expect(eventNames()).toEqual(['PORTO NOTURNO — TECHNO NA ORLA'])
    await user.click(screen.getByRole('link', { name: /Capa do evento PORTO NOTURNO/ }))
    expect(document.title).toBe('PORTO NOTURNO — TECHNO NA ORLA · CIRCUITO NE')
    expect(screen.getByRole('link', { name: 'ANERIE' }).getAttribute('href')).toBe('/artistas/art-anerie')
  })

  it('mostra ausência de eventos quando todas as datas das fixtures passaram', () => {
    vi.setSystemTime(new Date('2027-01-01T15:00:00Z'))
    open('/eventos')
    expect(screen.getByText('Nenhum evento futuro cadastrado.')).toBeTruthy()
    expect(screen.queryAllByRole('heading', { level: 3 })).toHaveLength(0)
  })

  it('mantém o evento em andamento no cartão da artista', () => {
    vi.setSystemTime(new Date(fixedTime.getTime() + 6.5 * 86400000))
    open('/artistas')
    const card = screen.getByRole('heading', { name: 'ANERIE' }).closest('article')
    expect(card).toBeTruthy()
    expect(within(card!).getByRole('link', { name: 'PORTO NOTURNO — TECHNO NA ORLA' })).toBeTruthy()
  })

  it.each([
    ['/artistas/ausente', 'Artista não encontrado.'],
    ['/coletivos/ausente', 'Coletivo não encontrado.'],
    ['/eventos/ausente', 'Evento não encontrado.'],
    ['/ausente', '404 — página não encontrada.'],
  ])('apresenta estado não encontrado em %s', (path, message) => {
    open(path)
    expect(screen.getByText(message, { exact: false })).toBeTruthy()
  })

  it('entra na sessão demo, navega pelos dados e limpa a sessão ao sair', async () => {
    open('/entrar')
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: '[demo] entrar como Ana' }))
    expect(screen.getByRole('heading', { level: 1 }).textContent).toContain('olá, Ana')
    await user.click(screen.getByRole('link', { name: 'Editar Dados' }))
    expect((screen.getByRole('textbox', { name: /Nome completo/ }) as HTMLInputElement).value).toBe('Ana Ribeiro')
    await user.click(screen.getByRole('button', { name: '[→] Sair da sessão' }))
    expect(window.location.pathname).toBe('/')
    window.history.pushState({}, '', '/painel')
    fireEvent(window, new PopStateEvent('popstate'))
    expect(window.location.pathname).toBe('/entrar')
    expect(screen.queryByRole('link', { name: 'Editar Dados' })).toBeNull()
  })

  it.each([
    ['Artista', 'Nome artístico / projeto'],
    ['Serviços', 'Nome / empresa'],
    ['Audiovisual', 'Nome / estúdio'],
    ['Integrante de Coletivo', 'Como deseja participar?'],
  ])('apresenta os campos da atuação %s sem submeter cadastro mock', async (kind, field) => {
    open('/entrar')
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: '[demo] entrar como Ana' }))
    await user.click(screen.getByRole('link', { name: 'Editar Dados' }))
    await user.click(screen.getByRole('link', { name: /nova atuação/i }))
    await user.click(screen.getByRole('radio', { name: kind }))
    const main = within(screen.getByRole('main'))
    if (kind === 'Integrante de Coletivo') {
      expect(main.getByRole('group', { name: new RegExp(field.replace('?', '\\?')) })).toBeTruthy()
      await user.click(main.getByRole('radio', { name: /Selecionar existente/ }))
      await user.selectOptions(main.getByRole('combobox', { name: /Coletivo\/Produtora/ }), 'col-litoral')
      expect((main.getByRole('combobox', { name: /Coletivo\/Produtora/ }) as HTMLSelectElement).value).toBe('col-litoral')
    } else {
      const input = main.getByRole('textbox', { name: new RegExp(field) })
      await user.type(input, 'Projeto de teste')
      expect((input as HTMLInputElement).value).toBe('Projeto de teste')
    }
  })

  it('não avança com cachê inválido na nova atuação artística', async () => {
    open('/entrar')
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: '[demo] entrar como Ana' }))
    await user.click(screen.getByRole('link', { name: 'Editar Dados' }))
    await user.click(screen.getByRole('link', { name: /nova atuação/i }))
    await user.click(screen.getByRole('radio', { name: 'Artista' }))
    await user.type(screen.getByRole('textbox', { name: /Nome artístico \/ projeto/ }), 'Projeto de teste')
    await user.type(screen.getByRole('textbox', { name: 'Média de cachê' }), 'R$ abc')
    await user.click(screen.getByRole('button', { name: 'avançar →' }))
    expect(screen.getByText('[erro] Informe um cachê válido.')).toBeTruthy()
    expect(screen.getByRole('textbox', { name: 'Média de cachê' })).toBeTruthy()
  })

  it('exige tipo de atuação e valida os dados gerais antes da próxima etapa', async () => {
    open('/cadastro')
    const user = userEvent.setup()
    await user.type(screen.getByRole('textbox', { name: /Nome completo/ }), 'Ana Teste')
    await user.type(screen.getByRole('textbox', { name: /E-mail/ }), 'a..b@example.org')
    fireEvent.change(screen.getByLabelText(/Data de nascimento/), { target: { value: '2010-01-01' } })
    await user.type(screen.getByRole('textbox', { name: /CPF/ }), 'abc12345678909')
    await user.type(screen.getByRole('textbox', { name: /Cidade/ }), 'Recife')
    await user.click(screen.getByRole('button', { name: 'avançar →' }))
    expect(screen.getByText('[erro] Escolha um tipo de cadastro.')).toBeTruthy()
    expect(screen.getByText('[erro] Informe um e-mail válido.')).toBeTruthy()
    expect(screen.getByText('[erro] Informe um CPF válido.')).toBeTruthy()
    expect(screen.getByText('[erro] É necessário ter 18 anos completos.')).toBeTruthy()

    await user.click(screen.getByRole('radio', { name: /^Artista/ }))
    await user.clear(screen.getByRole('textbox', { name: /E-mail/ }))
    await user.type(screen.getByRole('textbox', { name: /E-mail/ }), 'ana@example.org')
    fireEvent.change(screen.getByLabelText(/Data de nascimento/), { target: { value: '2000-01-01' } })
    await user.clear(screen.getByRole('textbox', { name: /CPF/ }))
    await user.type(screen.getByRole('textbox', { name: /CPF/ }), '12345678909')
    await user.click(screen.getByRole('button', { name: 'avançar →' }))
    expect(screen.getByRole('textbox', { name: 'instagram' })).toBeTruthy()
  })

  it('leva o foco ao primeiro campo inválido e anuncia seu erro', async () => {
    open('/cadastro')
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'avançar →' }))
    const nome = screen.getByRole('textbox', { name: /Nome completo/ })
    expect(document.activeElement).toBe(nome)
    expect(nome.getAttribute('aria-invalid')).toBe('true')
    expect(document.getElementById(nome.getAttribute('aria-describedby')!)?.textContent).toContain('Informe seu nome.')
  })

  it('leva o foco ao grupo de atuação quando somente o tipo falta', async () => {
    open('/cadastro')
    const user = userEvent.setup()
    await user.type(screen.getByRole('textbox', { name: /Nome completo/ }), 'Ana Teste')
    await user.type(screen.getByRole('textbox', { name: /E-mail/ }), 'ana@example.org')
    fireEvent.change(screen.getByLabelText(/Data de nascimento/), { target: { value: '2000-01-01' } })
    await user.type(screen.getByRole('textbox', { name: /CPF/ }), '12345678909')
    await user.type(screen.getByRole('textbox', { name: /Cidade/ }), 'Recife')
    await user.click(screen.getByRole('button', { name: 'avançar →' }))
    const artista = screen.getByRole('radio', { name: /^Artista/ })
    expect(document.activeElement).toBe(artista)
    expect(artista.getAttribute('aria-invalid')).toBe('true')
    expect(document.getElementById(artista.getAttribute('aria-describedby')!)?.textContent).toContain('Escolha um tipo de cadastro.')
  })

  it('foca a escolha de participação inválida na nova atuação', async () => {
    open('/entrar')
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: '[demo] entrar como Ana' }))
    await user.click(screen.getByRole('link', { name: 'Editar Dados' }))
    await user.click(screen.getByRole('link', { name: /nova atuação/i }))
    await user.click(screen.getByRole('radio', { name: 'Integrante de Coletivo' }))
    await user.click(screen.getByRole('button', { name: 'avançar →' }))
    const escolha = screen.getByRole('radio', { name: /Selecionar existente/ })
    expect(document.activeElement).toBe(escolha)
    expect(document.getElementById(escolha.getAttribute('aria-describedby')!)?.textContent).toContain('Escolha uma opção.')
  })

  it('rejeita fim anterior e preserva fim vazio ao criar evento em Fortaleza', async () => {
    open('/entrar')
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: '[demo] entrar como Ana' }))
    window.history.pushState({}, '', '/coletivo/col-litoral/eventos/novo')
    fireEvent(window, new PopStateEvent('popstate'))
    await user.type(await screen.findByRole('textbox', { name: /Nome do evento/ }), 'Evento horário teste')
    fireEvent.change(screen.getByLabelText(/Início/), { target: { value: '2026-09-24T19:30' } })
    fireEvent.change(screen.getByLabelText(/Fim/), { target: { value: '2026-09-24T18:30' } })
    await user.type(screen.getByRole('textbox', { name: /Cidade/ }), 'Recife')
    await user.type(screen.getByRole('textbox', { name: /Local/ }), 'Praça')
    await user.click(screen.getByRole('checkbox', { name: 'Evento gratuito' }))
    await user.click(screen.getByRole('button', { name: 'publicar evento' }))
    expect(screen.getByText('[erro] O fim deve ser posterior ao início.')).toBeTruthy()

    fireEvent.change(screen.getByLabelText(/Fim/), { target: { value: '' } })
    await user.click(screen.getByRole('button', { name: 'publicar evento' }))
    await user.click(screen.getByRole('link', { name: /Evento horário teste/ }))
    expect(screen.getByText('24 set 2026 · 19:30 (Fortaleza)')).toBeTruthy()
    expect(screen.getByText('Não informado')).toBeTruthy()
  })
})
