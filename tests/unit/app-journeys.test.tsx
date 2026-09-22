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
})
