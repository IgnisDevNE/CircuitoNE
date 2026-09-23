import { render, screen } from '@testing-library/react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { Markdown } from '../../src/components/ui/Markdown'

describe('Markdown', () => {
  it('codifica aspas de URL sem criar atributos no navegador ou servidor', () => {
    const source = '[abrir](https://example.org/"onmouseover="alert`1`)'
    const html = renderToStaticMarkup(<Markdown source={source} />)
    const ssr = document.createElement('div')
    ssr.innerHTML = html
    expect(ssr.querySelector('a')?.getAttribute('href')).toBe('https://example.org/%22onmouseover=%22alert%601%60')
    expect(ssr.querySelector('a')?.hasAttribute('onmouseover')).toBe(false)

    render(<Markdown source={source} />)
    const link = screen.getByRole('link', { name: 'abrir' })
    expect(link.getAttribute('href')).toBe('https://example.org/%22onmouseover=%22alert%601%60')
    expect(link.hasAttribute('onmouseover')).toBe(false)
  })

  it('mantém HTML e protocolos perigosos como texto, preservando a formatação permitida', () => {
    const source = '# Título\n- **forte** e *ênfase*\n<img src=x onerror=alert(1)>\n[perigo](javascript:alert(1))'
    const html = renderToStaticMarkup(<Markdown source={source} />)
    expect(html).not.toContain('<img')
    expect(html).not.toContain('href="javascript:')

    const { container } = render(<Markdown source={source} />)
    expect(screen.getByRole('heading', { name: 'Título' })).toBeTruthy()
    expect(container.querySelector('strong')?.textContent).toBe('forte')
    expect(container.querySelector('em')?.textContent).toBe('ênfase')
    expect(container.querySelector('img')).toBeNull()
    expect(container.querySelectorAll('a')).toHaveLength(0)
  })

  it('preserva URL externa com parênteses no servidor e no navegador', () => {
    const source = '[Mapa](https://example.org/evento_(ao-vivo))'
    const html = renderToStaticMarkup(<Markdown source={source} />)
    expect(html).toContain('href="https://example.org/evento_(ao-vivo)"')

    render(<Markdown source={source} />)
    expect(screen.getByRole('link', { name: 'Mapa' }).getAttribute('href')).toBe('https://example.org/evento_(ao-vivo)')
  })

  it('não carrega imagens nem cria links para URLs incompletas', () => {
    const source = '![pixel](https://example.org/pixel.png)\n[sem host](https://)'
    const html = renderToStaticMarkup(<Markdown source={source} />)
    expect(html).not.toContain('<img')
    expect(html).not.toContain('<a')

    const { container } = render(<Markdown source={source} />)
    expect(container.querySelector('img')).toBeNull()
    expect(container.querySelector('a')).toBeNull()
  })
})
