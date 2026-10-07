import type { Page } from '@playwright/test'

// Verificações de acessibilidade que o axe não faz (ou deixa "incompletas"), feitas no próprio navegador sobre o estado
// renderizado. Cada uma devolve a lista de falhas em texto; lista vazia = cumpre.

/**
 * Contraste de texto (1.4.3) a partir dos estilos computados: o axe marca como "incompleto" o texto cujo fundo ele não consegue
 * determinar (elementos parcialmente cobertos, fundos em camadas translúcidas). Aqui o fundo é composto subindo pelos
 * ancestrais (cores translúcidas somadas sobre a primeira cor opaca, ou sobre o fundo da página). Texto grande (24 px, ou 18,66 px
 * em negrito) pede 3:1; o demais, 4,5:1. Campos conferem texto digitado e placeholder. Elementos desabilitados são isentos.
 * Fundos com imagem não existem sob texto neste site (as imagens são `img` com texto fora delas).
 */
export async function textContrastFailures(page: Page, root = 'body'): Promise<string[]> {
  return page.evaluate((rootSelector) => {
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = 1
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!
    const rgba = (css: string): number[] => {
      ctx.clearRect(0, 0, 1, 1)
      ctx.fillStyle = '#000'
      ctx.fillStyle = css
      ctx.fillRect(0, 0, 1, 1)
      const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data
      return [r, g, b, a / 255]
    }
    const over = (top: number[], bottom: number[]): number[] => {
      const a = top[3] + bottom[3] * (1 - top[3])
      return a === 0 ? [0, 0, 0, 0] : [0, 1, 2].map((i) => (top[i] * top[3] + bottom[i] * bottom[3] * (1 - top[3])) / a).concat(a)
    }
    const lum = (c: number[]) => {
      const [r, g, b] = c.slice(0, 3).map((v) => {
        const s = v / 255
        return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
      })
      return 0.2126 * r + 0.7152 * g + 0.0722 * b
    }
    const ratio = (a: number[], b: number[]) => {
      const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x)
      return (hi + 0.05) / (lo + 0.05)
    }
    const pageColor = rgba(getComputedStyle(document.body).backgroundColor)
    const base = pageColor[3] === 1 ? pageColor : [5, 5, 6, 1]
    const background = (el: Element) => {
      const layers: number[][] = []
      for (let node: Element | null = el; node; node = node.parentElement) {
        const color = rgba(getComputedStyle(node).backgroundColor)
        if (color[3] > 0) layers.push(color)
        if (color[3] === 1) break
      }
      let result: number[] = layers.length && layers[layers.length - 1][3] === 1 ? layers.pop()! : base
      while (layers.length) result = over(layers.pop()!, result)
      return result
    }
    const opacityOf = (el: Element) => {
      let opacity = 1
      for (let node: Element | null = el; node; node = node.parentElement) opacity *= Number(getComputedStyle(node).opacity)
      return opacity
    }
    const visible = (el: Element) => {
      if (!el.getClientRects().length) return false
      const style = getComputedStyle(el)
      return style.visibility === 'visible' && style.display !== 'none'
    }
    const failures: string[] = []
    const seen = new Set<string>()
    const check = (el: Element, fgCss: string, label: string) => {
      if (el.closest('[disabled], [aria-disabled="true"], fieldset:disabled')) return
      const style = getComputedStyle(el)
      const bg = background(el)
      const fg0 = rgba(fgCss)
      const fg = over([fg0[0], fg0[1], fg0[2], fg0[3] * opacityOf(el)], bg)
      const size = parseFloat(style.fontSize)
      const large = size >= 24 || (size >= 18.66 && Number(style.fontWeight) >= 700)
      const need = large ? 3 : 4.5
      const got = ratio(fg, bg)
      if (got + 0.005 >= need) return
      const key = `${label}|${fgCss}|${bg.map(Math.round)}|${el.className}`
      if (seen.has(key)) return
      seen.add(key)
      const text = (el.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 50)
      failures.push(`${label} ${got.toFixed(2)}:1 < ${need} (${style.fontSize}) "${text}" <${el.tagName.toLowerCase()} class="${String(el.className).slice(0, 90)}">`)
    }
    for (const el of document.querySelector(rootSelector)!.querySelectorAll('*')) {
      if (!visible(el) || el.closest('svg, canvas, script, style, noscript')) continue
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName)) {
        const input = el as HTMLInputElement
        if (['hidden', 'checkbox', 'radio', 'file', 'range', 'color'].includes(input.type)) continue
        check(el, getComputedStyle(el).color, 'campo')
        if (el.tagName !== 'SELECT' && input.placeholder) check(el, getComputedStyle(el, '::placeholder').color, 'placeholder')
        continue
      }
      const hasText = [...el.childNodes].some((node) => node.nodeType === 3 && (node.textContent ?? '').trim().length > 0)
      if (hasText) check(el, getComputedStyle(el).color, 'texto')
    }
    return failures
  }, root)
}

/**
 * Contraste de componentes (1.4.11): o contorno de campos de texto, selects e áreas de texto é a única pista visual do limite do
 * campo e precisa de 3:1 contra o fundo que o cerca.
 */
export async function controlBorderFailures(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = 1
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!
    const rgba = (css: string): number[] => {
      ctx.clearRect(0, 0, 1, 1)
      ctx.fillStyle = '#000'
      ctx.fillStyle = css
      ctx.fillRect(0, 0, 1, 1)
      const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data
      return [r, g, b, a / 255]
    }
    const lum = (c: number[]) => {
      const [r, g, b] = c.slice(0, 3).map((v) => {
        const s = v / 255
        return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
      })
      return 0.2126 * r + 0.7152 * g + 0.0722 * b
    }
    const ratio = (a: number[], b: number[]) => {
      const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x)
      return (hi + 0.05) / (lo + 0.05)
    }
    const surroundings = (el: Element): number[] => {
      const layers: number[][] = []
      for (let node = el.parentElement; node; node = node.parentElement) {
        const color = rgba(getComputedStyle(node).backgroundColor)
        if (color[3] > 0) layers.push(color)
        if (color[3] === 1) break
      }
      let result = layers.length && layers[layers.length - 1][3] === 1 ? layers.pop()! : [5, 5, 6, 1]
      while (layers.length) {
        const top = layers.pop()!
        result = [0, 1, 2].map((i) => top[i] * top[3] + result[i] * (1 - top[3])).concat(1)
      }
      return result
    }
    const failures: string[] = []
    for (const el of document.querySelectorAll('input, textarea, select')) {
      const input = el as HTMLInputElement
      if (['hidden', 'checkbox', 'radio', 'submit', 'button', 'file'].includes(input.type) || input.disabled) continue
      if (!el.getClientRects().length || getComputedStyle(el).visibility !== 'visible') continue
      // O editor de markdown desenha o contorno no contêiner, não na área de texto.
      const own = getComputedStyle(el)
      const holder = parseFloat(own.borderTopWidth) === 0 && el.parentElement ? el.parentElement : el
      const style = getComputedStyle(holder)
      const border = rgba(style.borderTopColor)
      const where = `<${el.tagName.toLowerCase()} name="${input.name}">`
      if (parseFloat(style.borderTopWidth) === 0 || border[3] === 0) {
        failures.push(`sem contorno ${where}`)
        continue
      }
      const got = ratio(border, surroundings(holder))
      if (got < 3) failures.push(`contorno ${got.toFixed(2)}:1 < 3 ${where}`)
    }
    return failures
  })
}
