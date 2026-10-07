import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, Form, Link, Outlet, RouterProvider, useActionData } from 'react-router'
import { describe, expect, it } from 'vitest'
import { RouteA11y } from '../../src/components/layout/RouteA11y'

const Shell = () => (
  <>
    <RouteA11y />
    <nav>
      <Link to="/">Início</Link>
      <Link to="/sobre">Sobre</Link>
      <Link to="/sobre?q=1">Sobre com busca</Link>
    </nav>
    <Outlet />
  </>
)

function Signup() {
  const result = useActionData() as { error?: string } | undefined
  return (
    <main>
      <h1>Cadastro</h1>
      <Form method="post">
        <label htmlFor="nome">Nome</label>
        <input id="nome" name="nome" aria-invalid={result?.error ? true : undefined} />
        <button type="submit">Enviar</button>
      </Form>
    </main>
  )
}

const app = (path = '/') =>
  render(
    <RouterProvider
      router={createMemoryRouter(
        [
          {
            Component: Shell,
            children: [
              { index: true, Component: () => <main><h1>Início</h1></main> },
              { path: 'sobre', loader: () => new Promise((resolve) => setTimeout(() => resolve(null), 250)), Component: () => <main><h1>Sobre nós</h1></main> },
              { path: 'cadastro', action: () => ({ error: 'Informe o nome.' }), Component: Signup },
            ],
          },
        ],
        { initialEntries: [path] },
      )}
    />,
  )

describe('RouteA11y', () => {
  it('não mexe no foco na primeira exibição', async () => {
    app()
    await screen.findByRole('heading', { level: 1, name: 'Início' })
    expect(document.activeElement).toBe(document.body)
  })

  it('ao mudar de página leva o foco ao título da nova página', async () => {
    app()
    await userEvent.setup().click(await screen.findByRole('link', { name: 'Sobre' }))
    const heading = await screen.findByRole('heading', { level: 1, name: 'Sobre nós' })
    await waitFor(() => expect(document.activeElement).toBe(heading))
    expect(heading.getAttribute('tabindex')).toBe('-1')
  })

  it('mudar só a busca da URL não rouba o foco', async () => {
    app('/sobre')
    const user = userEvent.setup()
    const heading = await screen.findByRole('heading', { level: 1, name: 'Sobre nós' })
    const link = screen.getByRole('link', { name: 'Sobre com busca' })
    await user.click(link)
    await screen.findByRole('heading', { level: 1, name: 'Sobre nós' })
    expect(document.activeElement).toBe(link)
    expect(document.activeElement).not.toBe(heading)
  })

  it('anuncia o carregamento e mostra a barra de progresso enquanto a página carrega', async () => {
    const { container } = app()
    const user = userEvent.setup()
    await user.click(await screen.findByRole('link', { name: 'Sobre' }))
    await waitFor(() => expect(screen.getByTestId('route-status').textContent).toBe('Carregando…'))
    expect(container.ownerDocument.querySelector('[aria-hidden="true"].fixed')).not.toBeNull()
    await screen.findByRole('heading', { level: 1, name: 'Sobre nós' })
    await waitFor(() => expect(screen.getByTestId('route-status').textContent).toBe(''))
  })

  it('depois de um envio com erro leva o foco ao primeiro campo inválido', async () => {
    app('/cadastro')
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: 'Enviar' }))
    const field = await screen.findByLabelText('Nome')
    await waitFor(() => expect(field.getAttribute('aria-invalid')).toBe('true'))
    await waitFor(() => expect(document.activeElement).toBe(field))
  })
})
