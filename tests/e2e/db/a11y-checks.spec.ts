import { expect, test, type Page } from '@playwright/test'
import { artist, collective, event, hydrated, panelPaths, panelStatePaths, publicPaths, publicStatePaths, settleAnimations } from './a11y'
import { accentContrastColor, accentTextColor, ensureAccent } from '../../../src/lib/utils'
import { controlBorderFailures, textContrastFailures } from './a11y-checks'
import { clippedElements, focusWalk, reflowFailures, TEXT_SPACING_CSS } from './a11y-layout'
import { accounts, login } from './session'

// Cada teste percorre várias páginas ou estados com o axe: o padrão de 30 s não basta no runner do CI.
test.describe.configure({ timeout: 180_000 })

// Verificações complementares ao axe (W16), nos dois tamanhos de tela dos projetos de leitura: contraste calculado sobre o
// estado renderizado (inclusive o que o axe deixa "incompleto"), contornos de campos, reflow, espaçamento de texto e movimento.
// Só lê dados: nenhuma fixture é alterada.

let errors: string[]
test.beforeEach(({ page }) => {
  errors = []
  page.on('pageerror', (error) => errors.push(error.message))
})
test.afterEach(() => {
  expect(errors).toEqual([])
})

async function sweep(page: Page, paths: string[], check: (page: Page, path: string) => Promise<string[]>) {
  const failures: string[] = []
  for (const path of paths) {
    await page.goto(path)
    await hydrated(page)
    await page.evaluate(() => document.fonts.ready)
    await settleAnimations(page)
    for (const failure of await check(page, path)) failures.push(`${path}: ${failure}`)
  }
  return failures
}

test('contraste de texto (1.4.3) e de contornos de campos (1.4.11) em todas as rotas públicas', async ({ page }) => {
  const failures = await sweep(page, [...publicPaths, ...publicStatePaths], async (p) => [...(await textContrastFailures(p)), ...(await controlBorderFailures(p))])
  expect(failures.join('\n')).toBe('')
})

test('contraste de texto (1.4.3) e de contornos de campos (1.4.11) em todas as rotas do painel e do coletivo', async ({ page }) => {
  await login(page, accounts.active.email)
  const failures = await sweep(page, [...panelPaths, ...panelStatePaths], async (p) => [...(await textContrastFailures(p)), ...(await controlBorderFailures(p))])
  expect(failures.join('\n')).toBe('')
})

test('reflow (1.4.10): a 320 px de largura nenhuma rota exige rolagem horizontal', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 })
  const failures = await sweep(page, [...publicPaths, ...publicStatePaths], (p) => reflowFailures(p))
  await login(page, accounts.active.email)
  await page.setViewportSize({ width: 320, height: 640 })
  failures.push(...(await sweep(page, [...panelPaths, ...panelStatePaths], (p) => reflowFailures(p))))
  expect(failures.join('\n')).toBe('')
})

test('espaçamento de texto (1.4.12): com os valores do critério nada novo é cortado nem passa da largura da janela', async ({ page }) => {
  const failures: string[] = []
  const spaced = async (paths: string[]) => {
    for (const path of paths) {
      await page.goto(path)
      await hydrated(page)
      await settleAnimations(page)
      const before = await clippedElements(page)
      await page.addStyleTag({ content: TEXT_SPACING_CSS })
      const after = (await clippedElements(page)).filter((item) => !before.includes(item))
      const reflow = await reflowFailures(page)
      for (const item of [...after.map((a) => `cortado: ${a}`), ...reflow]) failures.push(`${path}: ${item}`)
    }
  }
  await spaced(publicPaths)
  await login(page, accounts.active.email)
  await spaced(panelPaths)
  expect(failures.join('\n')).toBe('')
})

test('movimento (2.2.2, 2.3.1): nada pisca ou se move sozinho por mais de 5 s, e com "reduzir movimento" nada se anima', async ({ page }) => {
  const running = () =>
    page.evaluate(() =>
      document
        .getAnimations()
        .filter((animation) => animation.playState === 'running')
        .map((animation) => {
          const timing = animation.effect!.getComputedTiming()
          const target = (animation.effect as KeyframeEffect).target as HTMLElement | null
          return { name: (animation as CSSAnimation).animationName ?? animation.id, total: timing.endTime as number, infinite: timing.iterations === Infinity, target: target?.className?.toString().slice(0, 60) ?? '' }
        }),
    )
  for (const path of ['/', '/artistas', '/entrar']) {
    await page.emulateMedia({ reducedMotion: 'no-preference' })
    await page.goto(path)
    await hydrated(page)
    const moving = (await running()).filter((a) => a.infinite || a.total > 5000)
    expect(moving, `${path}: animações longas ou infinitas`).toEqual([])
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.reload()
    await hydrated(page)
    await settleAnimations(page)
    expect(await running(), `${path}: animações com "reduzir movimento"`).toEqual([])
  }
})

const WALK_PUBLIC = ['/', '/artistas', '/eventos', `/eventos/${event}`, '/coletivos', `/coletivos/${collective}`, '/entrar', '/cadastro']
const WALK_PANEL = ['/painel', '/painel/dados', `/painel/perfil/${artist}`, '/painel/seguranca', '/painel/explorar/artistas', `/coletivo/${collective}/editar`, `/coletivo/${collective}/eventos/novo`]

test('teclado (2.1.1, 2.1.2, 2.4.3, 2.4.7, 2.4.11): Tab percorre tudo, cada parada tem foco visível e não fica escondida', async ({ page }) => {
  const failures: string[] = []
  const walk = async (paths: string[]) => {
    for (const path of paths) {
      await page.goto(path)
      await hydrated(page)
      const { stops, problems } = await focusWalk(page)
      if (stops < 2) failures.push(`${path}: só ${stops} parada(s) de foco`)
      for (const problem of problems) failures.push(`${path}: ${problem}`)
    }
  }
  await walk(WALK_PUBLIC)
  await login(page, accounts.active.email)
  await walk(WALK_PANEL)
  expect(failures.join('\n')).toBe('')
})

// Cores de destaque escolhidas por artistas e coletivos (AccentScope): do azul puro e do roxo quase preto ao branco e aos neons.
const ACCENTS = ['#0000ff', '#000080', '#220033', '#ffffff', '#00ff00', '#808080', '#ffcc00', '#ff00ff', '#1a1a8c', '#000000']

async function sweepAccents(page: Page, paths: string[]) {
  const failures: string[] = []
  for (const path of paths) {
    await page.goto(path)
    await hydrated(page)
    await settleAnimations(page)
    for (const color of ACCENTS) {
      const accent = ensureAccent(color)
      await page.evaluate(
        ([a, text, contrast]) => {
          for (const el of document.querySelectorAll<HTMLElement>('[style*="--accent"]')) {
            el.style.setProperty('--accent', a)
            el.style.setProperty('--accent-text', text)
            el.style.setProperty('--accent-contrast', contrast)
          }
        },
        [accent, accentTextColor(color), accentContrastColor(accent)],
      )
      for (const failure of await textContrastFailures(page)) failures.push(`${path} [${color}]: ${failure}`)
    }
  }
  return failures
}

test('cores de destaque personalizadas (AccentScope): texto, botões sólidos e contornos mantêm o contraste com qualquer cor', async ({ page }) => {
  const failures = await sweepAccents(page, [`/artistas/${artist}`, `/coletivos/${collective}`, `/eventos/${event}`, '/coletivos'])
  await login(page, accounts.active.email)
  failures.push(...(await sweepAccents(page, [`/coletivo/${collective}/painel`, `/painel/perfil/${artist}`, '/painel/explorar/coletivos', `/coletivo/${collective}/perfil`])))
  expect(failures.join('\n')).toBe('')
})
