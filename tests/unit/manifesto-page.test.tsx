import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { describe, expect, it } from 'vitest'
import { PublicLayout } from '../../src/components/layout/PublicLayout'
import { Manifesto } from '../../src/pages/public/Manifesto'
import { meta as manifestoMeta } from '../../src/routes/manifesto'

describe('Manifesto', () => {
  it('é uma página pública com um único h1 e a mensagem "Em breve"', () => {
    render(<Manifesto />)
    expect(screen.getByRole('heading', { level: 1 }).textContent).toContain('manifesto')
    expect(screen.getByText('Em breve')).toBeTruthy()
  })

  it('define título e descrição', () => {
    const tags = manifestoMeta()
    expect(tags).toContainEqual({ title: 'Manifesto · CIRCUITO NE' })
    expect(tags.find((tag) => 'name' in tag && tag.name === 'description')).toMatchObject({ content: expect.stringContaining('manifesto') })
  })
})

describe('menu principal', () => {
  const layout = () =>
    render(
      <MemoryRouter>
        <PublicLayout signedIn={false}>
          <p>conteúdo</p>
        </PublicLayout>
      </MemoryRouter>,
    )

  it('desktop: "Manifesto" vem depois de "Eventos" e leva a /manifesto', () => {
    layout()
    const links = within(screen.getByRole('navigation', { name: 'Principal' })).getAllByRole('link')
    expect(links.map((link) => link.textContent)).toEqual(['Artistas', 'Coletivos', 'Eventos', 'Manifesto', 'Entrar'])
    expect(links[3].getAttribute('href')).toBe('/manifesto')
  })

  it('celular: o menu recolhido também traz "Manifesto" depois de "Eventos"', async () => {
    layout()
    await userEvent.setup().click(screen.getByRole('button', { name: 'Abrir menu' }))
    const links = within(screen.getByRole('navigation', { name: 'Principal (móvel)' })).getAllByRole('link')
    expect(links.map((link) => link.textContent)).toEqual(['Artistas', 'Coletivos', 'Eventos', 'Manifesto', 'Entrar'])
    expect(links[3].getAttribute('href')).toBe('/manifesto')
  })
})
