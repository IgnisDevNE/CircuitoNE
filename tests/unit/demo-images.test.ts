// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { artSvg, initials, objectPath } from '../../scripts/demo-images.mjs'

const id = 'd0020000-0000-4000-8000-000000000001'

describe('imagens de demonstração', () => {
  it('gera a mesma arte para a mesma entidade e variação, e outra para outra variação', () => {
    const base = { seed: id, name: 'ANERIE', color: '#ff2040', width: 1200, height: 1200 }
    expect(artSvg(base)).toBe(artSvg(base))
    expect(artSvg({ ...base, variant: 1 })).not.toBe(artSvg(base))
    expect(artSvg(base)).toContain('width="1200"')
  })

  it('escapa o nome no SVG e usa a paleta quando a cor é inválida', () => {
    const svg = artSvg({ seed: id, name: 'A & <B>', color: 'vermelho', width: 100, height: 100 })
    expect(svg).toContain('a &#38; &#60;b&#62;')
    expect(svg).not.toContain('vermelho')
  })

  it('tira até duas iniciais do nome', () => {
    expect(initials('ANERIE')).toBe('A')
    expect(initials('BOITATÁ SYSTEM')).toBe('BS')
    expect(initials('PORTO NOTURNO — TECHNO NA ORLA')).toBe('PN')
  })

  it('monta caminhos aceitos pelas colunas e RPCs de imagem', () => {
    const path = objectPath(id, 'demo-galeria-1')
    expect(path).toMatch(new RegExp(`^${id}/[a-zA-Z0-9_-]{1,100}\\.(jpg|jpeg|png|webp)$`))
  })
})
