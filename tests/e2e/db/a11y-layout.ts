import type { Page } from '@playwright/test'

// Verificações de layout e de teclado (W16) que não dependem de leitor de tela: reflow, espaçamento de texto e foco.

/**
 * Reflow (1.4.10): a 320 px de largura CSS (equivale a 1280 px com zoom de 400%) nada exige rolagem horizontal da página. Conteúdo
 * dentro de um contêiner com rolagem própria (tabelas, listas roláveis) não conta; texto só para leitor de tela (`sr-only`) também não.
 * Devolve os elementos visíveis que passam da borda direita da janela.
 */
export async function reflowFailures(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const width = document.documentElement.clientWidth
    const failures: string[] = []
    const scroll = document.documentElement.scrollWidth - width
    if (scroll > 0) failures.push(`rolagem horizontal da página: ${scroll}px`)
    for (const el of document.body.querySelectorAll('*')) {
      const style = getComputedStyle(el)
      if (style.display === 'none' || style.visibility === 'hidden' || el.closest('svg')) continue
      const rect = el.getBoundingClientRect()
      // Texto sem ponto de quebra que passa da própria caixa (a caixa cabe, o texto não).
      if (style.overflowX === 'visible' && rect.width > 1 && el.scrollWidth > el.clientWidth + 1 && rect.left + el.scrollWidth > width + 1 && [...el.childNodes].some((node) => node.nodeType === 3 && (node.textContent ?? '').trim())) {
        failures.push(`texto passa da tela: <${el.tagName.toLowerCase()} class="${String(el.className).slice(0, 80)}"> ${(el.textContent ?? '').trim().slice(0, 30)}`)
        continue
      }
      if (rect.width === 0 || rect.height === 0 || rect.right <= width + 1) continue
      // `sr-only` (1 px, recortado) e elementos dentro de um contêiner que rola sozinho.
      if (rect.width <= 1 && rect.height <= 1) continue
      let scroller = false
      for (let node = el.parentElement; node && node !== document.body; node = node.parentElement) {
        const overflow = getComputedStyle(node).overflowX
        if (['auto', 'scroll', 'hidden', 'clip'].includes(overflow)) {
          scroller = true
          break
        }
      }
      if (scroller) continue
      failures.push(`<${el.tagName.toLowerCase()} class="${String(el.className).slice(0, 80)}"> termina em ${Math.round(rect.right)}px (janela de ${width}px)`)
      if (failures.length > 8) break
    }
    return failures
  })
}

/** Elementos cujo texto está cortado (overflow oculto com conteúdo além da caixa), em texto: a base para comparar antes e depois. */
export async function clippedElements(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const result: string[] = []
    for (const el of document.body.querySelectorAll('*')) {
      const style = getComputedStyle(el)
      if (style.display === 'none' || style.visibility === 'hidden' || el.closest('svg')) continue
      // `data-teaser`: resumo de uma linha (última mensagem da conversa) cujo texto completo é a própria conversa, um clique adiante.
      if (el.hasAttribute('data-teaser')) continue
      const rect = el.getBoundingClientRect()
      if (rect.width <= 1 && rect.height <= 1) continue // sr-only
      const clips = (value: string) => value === 'hidden' || value === 'clip'
      const hasText = [...el.childNodes].some((node) => node.nodeType === 3 && (node.textContent ?? '').trim()) || el.children.length > 0
      if (!hasText) continue
      const clampsX = clips(style.overflowX) && el.scrollWidth > el.clientWidth + 1
      const clampsY = (clips(style.overflowY) || style.webkitLineClamp !== 'none' && style.webkitLineClamp !== '') && el.scrollHeight > el.clientHeight + 1
      if (clampsX || clampsY) result.push(`<${el.tagName.toLowerCase()} class="${String(el.className).slice(0, 70)}">${(el.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 30)}`)
    }
    return result
  })
}

/** Folha de estilo do critério 1.4.12 (espaçamento de texto): linhas 1,5, parágrafos 2, letras 0,12 e palavras 0,16 do corpo da fonte. */
export const TEXT_SPACING_CSS = `
  * { line-height: 1.5 !important; letter-spacing: 0.12em !important; word-spacing: 0.16em !important; }
  p { margin-bottom: 2em !important; }
`

export type FocusStep = { index: number; label: string; problems: string[] }

/**
 * Percorre a página com Tab e confere, a cada parada: (a) o foco tem indicador visível (contorno ou sombra com 2 px ou mais, 2.4.7);
 * (b) o elemento não fica escondido sob conteúdo fixo (cabeçalho fixo, janela do chat, 2.4.11) nem fora da janela; (c) o foco não
 * fica preso (a sequência termina saindo do documento ou voltando ao início, 2.1.2). Devolve os problemas e o número de paradas.
 */
export async function focusWalk(page: Page, maxStops = 150): Promise<{ stops: number; problems: string[]; labels: string[] }> {
  const problems: string[] = []
  const labels: string[] = []
  // Recomeça do início do documento: tirar o foco não zera o ponto de partida do Tab, a seleção sim.
  await page.evaluate(() => {
    ;(document.activeElement as HTMLElement | null)?.blur()
    window.scrollTo(0, 0)
    getSelection()?.collapse(document.body, 0)
  })
  let first = ''
  let stops = 0
  for (let index = 0; index < maxStops; index++) {
    await page.keyboard.press('Tab')
    const info = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null
      if (!el || el === document.body || el === document.documentElement) return null
      const rect = el.getBoundingClientRect()
      const style = getComputedStyle(el)
      const name = (el.getAttribute('aria-label') || el.textContent || (el as HTMLInputElement).name || el.id || '').replace(/\s+/g, ' ').trim().slice(0, 40)
      const label = `${el.tagName.toLowerCase()}${el.getAttribute('type') ? `[${el.getAttribute('type')}]` : ''} "${name}"`
      const outline = style.outlineStyle !== 'none' && parseFloat(style.outlineWidth) >= 2
      const shadow = style.boxShadow !== 'none'
      const centerX = Math.min(Math.max(rect.left + rect.width / 2, 0), window.innerWidth - 1)
      const centerY = Math.min(Math.max(rect.top + rect.height / 2, 0), window.innerHeight - 1)
      const top = document.elementFromPoint(centerX, centerY)
      const covered = !!top && !(el.contains(top) || top.contains(el))
      // Um elemento mais alto que a janela só precisa ter o início à vista.
      const inView = rect.bottom > 0 && rect.top < window.innerHeight && rect.right > 0 && rect.left < window.innerWidth
      const fixedCover = covered ? `${top!.tagName.toLowerCase()}.${String(top!.className).slice(0, 40)}` : ''
      return { label, outline, shadow, covered, inView, fixedCover, isDocument: el.tagName === 'IFRAME', key: `${el.tagName}|${name}|${Math.round(rect.top + window.scrollY)}|${Math.round(rect.left)}` }
    })
    // Logo após zerar o ponto de partida o primeiro Tab pode pousar no próprio documento; depois, voltar ao documento é a
    // sequência terminar (o foco saiu para a barra do navegador) sem prender o teclado.
    if (!info) {
      if (stops === 0 && index < 3) continue
      break
    }
    if (stops === 0) first = info.key
    else if (info.key === first) break // voltou ao primeiro: ciclo completo
    stops++
    labels.push(info.label)
    const found: string[] = []
    if (!info.outline && !info.shadow) found.push('sem indicador de foco')
    if (!info.inView) found.push('fora da janela')
    if (info.covered) found.push(`coberto por ${info.fixedCover}`)
    if (found.length) problems.push(`#${index + 1} ${info.label}: ${found.join(', ')}`)
  }
  return { stops, problems, labels }
}
