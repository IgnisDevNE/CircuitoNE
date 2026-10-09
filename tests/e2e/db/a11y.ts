import AxeBuilder from '@axe-core/playwright'
import { expect, type Page } from '@playwright/test'

// Auditoria automática de acessibilidade (W16): axe-core com as regras WCAG 2.0, 2.1 e 2.2 níveis A e AA.
// Nenhuma regra é desligada em bloco; exceções, se houver, ficam em `excluded` com a justificativa.
export const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice']

/** As páginas funcionam sem JavaScript, mas os testes esperam a hidratação para não auditar um estado intermediário. */
export const hydrated = (page: Page) =>
  expect
    .poll(() => page.locator('main').first().evaluate((main) => Object.keys(main).some((key) => key.startsWith('__reactFiber'))))
    .toBe(true)

/** Espera as animações finitas terminarem (entrada com `fade-up`, rastro do `scan`): o contraste é medido no estado final. */
export const settleAnimations = (page: Page) =>
  page.evaluate(() => Promise.all(document.getAnimations().filter((animation) => animation.effect?.getComputedTiming().iterations !== Infinity).map((animation) => animation.finished.catch(() => undefined))).then(() => undefined))

/** Espera fontes e animações de entrada terminarem: o contraste é medido sobre o estado final. */
async function settle(page: Page) {
  await page.evaluate(() => document.fonts.ready)
  await settleAnimations(page)
}

export type Audit = { violations: string[]; incomplete: string[] }

type Options = { include?: string; extraTags?: string[] }

/** Roda o axe na página (ou num trecho, com `include`) e devolve as violações em texto legível. */
export async function audit(page: Page, label: string, options: Options = {}): Promise<Audit> {
  await settle(page)
  // `label-content-name-mismatch` (2.5.3, rótulo no nome acessível) é experimental no axe e vem desligada: aqui fica ligada.
  let builder = new AxeBuilder({ page })
    .withTags([...WCAG_TAGS, ...(options.extraTags ?? [])])
    .options({ rules: { 'label-content-name-mismatch': { enabled: true } } })
  if (options.include) builder = builder.include(options.include)
  const results = await builder.analyze()
  const describe = (items: typeof results.violations) =>
    items.map((rule) => {
      const nodes = rule.nodes
        .slice(0, 6)
        .map(
          (node) =>
            `    ${node.target.join(' >> ')}\n      ${node.html.replace(/\s+/g, ' ').slice(0, 160)}\n      ${(node.any[0]?.message ?? node.all[0]?.message ?? node.none[0]?.message ?? '').replace(/\s+/g, ' ')}`,
        )
        .join('\n')
      return `[${label}] ${rule.id} (${rule.impact}) x${rule.nodes.length}: ${rule.help}\n${nodes}`
    })
  return { violations: describe(results.violations), incomplete: describe(results.incomplete) }
}

/** Falha o teste (sem interromper as demais rotas) quando o axe encontra qualquer violação. */
export async function expectNoViolations(page: Page, label: string, options?: Options) {
  const { violations, incomplete } = await audit(page, label, options)
  if (process.env.A11Y_INCOMPLETE && incomplete.length) console.log(`INCOMPLETE\n${incomplete.join('\n')}`)
  expect.soft(violations.join('\n'), `${label}: violações de acessibilidade`).toBe('')
}

// Fixtures das seeds (identity.sql, collectives.sql, events.sql, messages.sql) usadas nas rotas auditadas.
export const collective = '05000000-0000-4000-8000-000000000001'
export const artist = '02000000-0000-4000-8000-000000000001'
export const event = '0a000000-0000-4000-8000-000000000001'
export const conversation = '0d000000-0000-4000-8000-000000000001'

export const publicPaths = [
  '/',
  '/artistas',
  `/artistas/${artist}`,
  '/coletivos',
  `/coletivos/${collective}`,
  '/eventos',
  `/eventos/${event}`,
  '/manifesto',
  '/entrar',
  '/cadastro',
  '/rota-inexistente',
]

export const panelPaths = [
  '/painel',
  '/painel/dados',
  '/painel/dados/nova-atuacao',
  `/painel/perfil/${artist}`,
  '/painel/seguranca',
  '/painel/mensagens',
  `/painel/mensagens/${conversation}`,
  `/painel/mensagens/nova?para=collective:${collective}`,
  '/painel/coletivos',
  '/painel/coletivos/novo',
  '/painel/explorar/artistas',
  '/painel/explorar/servicos',
  '/painel/explorar/audiovisual',
  '/painel/explorar/coletivos',
  `/coletivo/${collective}/painel`,
  `/coletivo/${collective}/solicitacoes`,
  `/coletivo/${collective}/mensagens`,
  `/coletivo/${collective}/membros`,
  `/coletivo/${collective}/editar`,
  `/coletivo/${collective}/perfil`,
  `/coletivo/${collective}/eventos/novo`,
  `/coletivo/${collective}/eventos/${event}`,
]

// Outros estados das fixtures: evento em andamento (2), encerrado (3), cancelado (4), adiado (6) e com tipo "outros" (8); coletivo
// produtor (6); atuações de serviços (3) e audiovisual (4); coletivos pendente (2), suspenso (3), recusado (4) e encerrado (5).
const id = (prefix: string, n: number) => `${prefix}000000-0000-4000-8000-${String(n).padStart(12, '0')}`
export const eventOf = (n: number) => id('0a', n)
export const collectiveOf = (n: number) => id('05', n)
export const profileOf = (n: number) => id('02', n)

export const publicStatePaths = [
  `/eventos/${eventOf(2)}`,
  `/eventos/${eventOf(3)}`,
  `/eventos/${eventOf(4)}`,
  `/eventos/${eventOf(6)}`,
  `/eventos/${eventOf(8)}`,
  `/coletivos/${collectiveOf(6)}`,
  // Não publicados ou inexistentes: a página de "não encontrado" da própria rota.
  `/artistas/${profileOf(2)}`,
  `/coletivos/${collectiveOf(2)}`,
  `/eventos/${eventOf(5)}`,
  '/eventos/identificador-invalido',
]

export const panelStatePaths = [
  `/painel/perfil/${profileOf(3)}`,
  `/painel/perfil/${profileOf(4)}`,
  `/painel/perfil/${profileOf(2)}`,
  '/painel/explorar/inexistente',
  ...[2, 3, 4, 5, 6].map((n) => `/coletivo/${collectiveOf(n)}/painel`),
  `/coletivo/${collectiveOf(2)}/editar`,
  `/coletivo/${collective}/eventos/${eventOf(4)}`,
  `/coletivo/${collective}/eventos/${eventOf(5)}`,
  `/coletivo/${collective}/eventos/${eventOf(6)}`,
]
