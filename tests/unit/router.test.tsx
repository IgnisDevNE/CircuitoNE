import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { Link, RouterProvider, Routes, useParams } from '../../src/router'

function Profile() {
  const { id } = useParams()
  return <h1>Artista {id}</h1>
}

function Journey() {
  return (
    <RouterProvider>
      <Link to="/artistas/ana">Ver artista</Link>
      <Routes routes={[
        { path: '/', element: <h1>Início</h1> },
        { path: '/artistas/:id', element: <Profile /> },
      ]} notFound={<h1>Página não encontrada</h1>} />
    </RouterProvider>
  )
}

describe('roteador do protótipo — caracterização, sem autorização real', () => {
  it('navega pelo link e lê o parâmetro da rota', async () => {
    render(<Journey />)
    await userEvent.click(screen.getByRole('link', { name: 'Ver artista' }))
    expect(screen.getByRole('heading').textContent).toBe('Artista ana')
    expect(window.location.pathname).toBe('/artistas/ana')
  })

  it('reage ao histórico e apresenta a página não encontrada', () => {
    render(<Journey />)
    window.history.replaceState({}, '', '/inexistente')
    fireEvent(window, new PopStateEvent('popstate'))
    expect(screen.getByRole('heading').textContent).toBe('Página não encontrada')
  })

  it('preserva clique com modificador para o navegador', () => {
    render(<Journey />)
    const push = vi.spyOn(window.history, 'pushState')
    let cancelledByRouter: boolean | undefined
    // Observa o evento depois do React e impede apenas a navegação do jsdom.
    document.addEventListener('click', (event) => {
      cancelledByRouter = event.defaultPrevented
      event.preventDefault()
    }, { once: true })
    fireEvent.click(screen.getByRole('link'), { ctrlKey: true })
    expect(cancelledByRouter).toBe(false)
    expect(push).not.toHaveBeenCalled()
    expect(screen.getByRole('heading').textContent).toBe('Início')
  })

  it('resolve acesso direto e parâmetro codificado', () => {
    window.history.replaceState({}, '', '/artistas/jo%C3%A3o')
    render(<Journey />)
    expect(screen.getByRole('heading').textContent).toBe('Artista joão')
  })
})
