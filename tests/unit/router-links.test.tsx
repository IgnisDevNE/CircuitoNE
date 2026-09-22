import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { Link, NavLink, RouterProvider, Routes, useParams } from '../../src/router'

function Profile() {
  return <h1>Artista {useParams().id}</h1>
}

describe('navegação do protótipo — regressões e comportamento nativo de links', () => {
  it.each([
    { to: 'https://example.org/artista' },
    { to: 'mailto:contato@example.org' },
    { to: '/artistas/ana', target: '_blank' },
    { to: '/artistas/ana', target: 'preview' },
    { to: '/presskit.pdf', download: '' },
    { to: '/#conteudo' },
    { to: '/artistas/ana', altKey: true },
    { to: '/artistas/ana', ctrlKey: true },
    { to: '/artistas/ana', metaKey: true },
    { to: '/artistas/ana', shiftKey: true },
    { to: '/artistas/ana', button: 1 },
  ])('delega ao navegador: %j', ({ to, target, download, ...click }) => {
    const onClick = vi.fn()
    render(<RouterProvider><Link to={to} target={target} download={download} onClick={onClick}>Abrir</Link></RouterProvider>)
    const push = vi.spyOn(window.history, 'pushState')
    let intercepted: boolean | undefined
    document.addEventListener('click', event => {
      intercepted = event.defaultPrevented
      event.preventDefault() // Evita somente a navegação externa do jsdom, após o React.
    }, { once: true })
    fireEvent.click(screen.getByRole('link'), click)
    expect(onClick).toHaveBeenCalledOnce()
    expect(intercepted).toBe(false)
    expect(push).not.toHaveBeenCalled()
  })

  it('respeita cancelamento pelo consumidor', () => {
    render(<RouterProvider><Link to="/artistas/ana" onClick={event => event.preventDefault()}>Abrir</Link></RouterProvider>)
    const push = vi.spyOn(window.history, 'pushState')
    fireEvent.click(screen.getByRole('link'))
    expect(push).not.toHaveBeenCalled()
    expect(window.location.pathname).toBe('/')
  })

  it('mantém query na URL, resolve pelo pathname e permite limpar a query', () => {
    render(<RouterProvider>
      <Link to="/artistas/ana?origem=busca">Com filtro</Link>
      <Link to="/artistas/ana">Limpar</Link>
      <Routes routes={[{ path: '/artistas/:id', element: <Profile /> }]} />
    </RouterProvider>)
    fireEvent.click(screen.getByText('Com filtro'))
    expect(screen.getByRole('heading').textContent).toBe('Artista ana')
    expect(window.location.search).toBe('?origem=busca')
    fireEvent.click(screen.getByText('Limpar'))
    expect(window.location.search).toBe('')
    expect(screen.getByRole('heading').textContent).toBe('Artista ana')
  })

  it('usa replace para link interno absoluto e atualiza o link ativo', () => {
    render(<RouterProvider>
      <Link to={`${window.location.origin}/artistas/ana`} replace target="_self">Abrir</Link>
      <NavLink to="/artistas" activeClassName="ativo">Artistas</NavLink>
      <NavLink to="/" end activeClassName="ativo">Início</NavLink>
      <Routes routes={[{ path: '/artistas/:id', element: <Profile /> }]} />
    </RouterProvider>)
    const replace = vi.spyOn(window.history, 'replaceState')
    const push = vi.spyOn(window.history, 'pushState')
    fireEvent.click(screen.getByText('Abrir'))
    expect(replace).toHaveBeenCalledOnce()
    expect(push).not.toHaveBeenCalled()
    expect(screen.getByRole('heading').textContent).toBe('Artista ana')
    expect(screen.getByText('Artistas').getAttribute('aria-current')).toBe('page')
    expect(screen.getByText('Início').hasAttribute('aria-current')).toBe(false)
  })

  it('trata parâmetro com escape inválido como rota não encontrada', () => {
    window.history.replaceState({}, '', '/artistas/%E0%A4%A')
    render(<RouterProvider><Routes routes={[{ path: '/artistas/:id', element: <Profile /> }]} notFound={<h1>Não encontrado</h1>} /></RouterProvider>)
    expect(screen.getByRole('heading').textContent).toBe('Não encontrado')
  })

  it('identifica link ativo por pathname, ignorando query e rejeitando outra origem', () => {
    window.history.replaceState({}, '', '/artistas?estilo=dub')
    render(<RouterProvider>
      <NavLink to="/artistas?estilo=dub" end>Com filtro</NavLink>
      <NavLink to={`${window.location.origin}/artistas`} end>Absoluto</NavLink>
      <NavLink to="https://example.org/artistas">Externo</NavLink>
    </RouterProvider>)
    expect(screen.getByText('Com filtro').getAttribute('aria-current')).toBe('page')
    expect(screen.getByText('Absoluto').getAttribute('aria-current')).toBe('page')
    expect(screen.getByText('Externo').hasAttribute('aria-current')).toBe(false)
  })
})
