import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { links } from '../../src/root'

describe('favicon', () => {
  it('o documento declara o .ico e o SVG, e os dois arquivos existem em public/', () => {
    const icons = links()
    expect(icons).toContainEqual({ rel: 'icon', href: '/favicon.ico', sizes: '32x32' })
    expect(icons).toContainEqual({ rel: 'icon', href: '/favicon.svg', type: 'image/svg+xml' })
    for (const { href } of icons) expect(existsSync(`public${href}`), href).toBe(true)
  })

  it('o SVG usa a cor de destaque da marca; o .ico é um ícone válido', () => {
    expect(readFileSync('public/favicon.svg', 'utf8')).toContain('#ff2040')
    const ico = readFileSync('public/favicon.ico')
    expect([...ico.subarray(0, 4)]).toEqual([0, 0, 1, 0])
  })
})
