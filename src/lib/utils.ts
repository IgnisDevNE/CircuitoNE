import { EVENTO_TIPO_LABEL, type Evento } from '../data/types'

export function cx(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(' ')
}

/** `className` de `NavLink` com um trecho extra quando o link da rota está ativo. */
export const navClass = (base: string, active: string) => ({ isActive }: { isActive: boolean }) => cx(base, isActive && active)

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']
const eventZone = 'America/Fortaleza'
const eventParts = new Intl.DateTimeFormat('en-US', {
  timeZone: eventZone, year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
})
const eventOffset = new Intl.DateTimeFormat('en-US', { timeZone: eventZone, timeZoneName: 'longOffset' })

function fortalezaParts(date: Date) {
  return Object.fromEntries(eventParts.formatToParts(date).map(({ type, value }) => [type, value]))
}

/** Interpreta datetime-local no fuso do evento, nunca no fuso do navegador. */
export function parseFortalezaDateTime(value: string): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value)
  if (!match) return null
  const guess = new Date(`${value}:00Z`)
  if (Number.isNaN(guess.getTime())) return null
  const zoneName = eventOffset.formatToParts(guess).find(({ type }) => type === 'timeZoneName')?.value
  const offset = zoneName?.replace(/^GMT/, '') || '+00:00'
  const date = new Date(`${value}:00${offset}`)
  if (Number.isNaN(date.getTime())) return null
  const p = fortalezaParts(date)
  if ([p.year, p.month, p.day, p.hour, p.minute].some((part, i) => part !== match[i + 1])) return null
  return date.toISOString()
}

/** Inverso de `parseFortalezaDateTime`: o valor de um `datetime-local` com a hora de Fortaleza de um instante. */
export function toFortalezaInput(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  const p = fortalezaParts(date)
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`
}

export function fmtData(iso: string) {
  const p = fortalezaParts(new Date(iso))
  return `${p.day} ${MESES[Number(p.month) - 1]} ${p.year}`
}

export function fmtDataHora(iso: string) {
  const p = fortalezaParts(new Date(iso))
  return `${fmtData(iso)} · ${p.hour}:${p.minute} (Fortaleza)`
}

function fortalezaDay(date: Date) {
  const p = fortalezaParts(date)
  return `${p.year}-${p.month}-${p.day}`
}

export function eventoNaoEncerrado(evento: Evento, now = Date.now()) {
  if (evento.fim) return Date.parse(evento.fim) > now
  return fortalezaDay(new Date(evento.inicio)) >= fortalezaDay(new Date(now))
}

export function tipoEventoLabel(e: Evento) {
  return e.tipo === 'outros' && e.tipoOutro ? e.tipoOutro : EVENTO_TIPO_LABEL[e.tipo]
}

// ---- cachê (reais <-> centavos) ----
/** Lê uma quantia única em reais no formato brasileiro e devolve centavos inteiros. */
export function parseCacheCents(v: string): number | null {
  const match = /^(?:R\$\s*)?(\d{1,3}(?:\.\d{3})+|\d+)(?:,(\d{1,2}))?$/.exec(v.trim())
  if (!match) return null
  const cents = Number(match[1].replace(/\./g, '')) * 100 + Number((match[2] ?? '').padEnd(2, '0'))
  return Number.isSafeInteger(cents) ? cents : null
}

/** Centavos inteiros em reais, no formato brasileiro (`R$ 1.500,00`). */
export function formatCacheCents(cents: number) {
  const intFmt = String(Math.floor(cents / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  return `R$ ${intFmt},${String(cents % 100).padStart(2, '0')}`
}

// ---- WCAG contrast helpers ----
function hexToRgb(hex: string): [number, number, number] {
  let h = hex.replace('#', '')
  if (h.length === 3) h = h.split('').map((c) => c + c).join('')
  const n = parseInt(h, 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

function luminance([r, g, b]: [number, number, number]) {
  const a = [r, g, b].map((v) => {
    const s = v / 255
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
  })
  return 0.2126 * a[0] + 0.7152 * a[1] + 0.0722 * a[2]
}

/** Razão de contraste WCAG entre duas cores `#rgb`/`#rrggbb` (1 a 21). */
export function contrastRatio(fg: string, bg: string) {
  const l1 = luminance(hexToRgb(fg))
  const l2 = luminance(hexToRgb(bg))
  const [hi, lo] = l1 > l2 ? [l1, l2] : [l2, l1]
  return (hi + 0.05) / (lo + 0.05)
}

// Superfícies de index.css (--color-bg, --color-bg-elev, --color-surface) sobre as quais o destaque é desenhado. O destaque
// também aparece como tom de 12% a 15% (itens ativos, hover), então o texto é conferido contra as superfícies puras e tingidas.
const SURFACES = ['#050506', '#0b0b0d', '#101014']
const TINT = 0.15

function mixHex(base: string, over: string, amount: number) {
  const [br, bg, bb] = hexToRgb(base)
  const [or, og, ob] = hexToRgb(over)
  return rgbHex(Math.round(br + (or - br) * amount), Math.round(bg + (og - bg) * amount), Math.round(bb + (ob - bb) * amount))
}

const lighten = ([r, g, b]: [number, number, number], amount: number): [number, number, number] => [
  Math.min(255, Math.round(r + (255 - r) * amount)),
  Math.min(255, Math.round(g + (255 - g) * amount)),
  Math.min(255, Math.round(b + (255 - b) * amount)),
]

// Ensure an accent color is bright enough to serve as non-text UI (>= 3:1 on every dark surface, WCAG 1.4.11).
// If too dark, lighten it toward white until it clears the floor.
export function ensureAccent(hex: string, floor = 3): string {
  try {
    let rgb = hexToRgb(hex)
    let steps = 0
    while (SURFACES.some((surface) => contrastRatio(rgbHex(...rgb), surface) < floor) && steps < 20) {
      rgb = lighten(rgb, 0.15)
      steps++
    }
    return rgbHex(...rgb)
  } catch {
    return '#ff2040'
  }
}

// Lighter variant for accent-as-small-text (>= 4.5:1 on the dark surfaces, plain and accent-tinted, WCAG 1.4.3).
export function accentTextColor(hex: string, floor = 4.5): string {
  let rgb = hexToRgb(hex)
  let steps = 0
  const clears = (color: string) => [...SURFACES, ...SURFACES.map((surface) => mixHex(surface, color, TINT))].every((surface) => contrastRatio(color, surface) >= floor)
  while (!clears(rgbHex(...rgb)) && steps < 40) {
    rgb = lighten(rgb, 0.12)
    steps++
  }
  return rgbHex(...rgb)
}

// Cor do texto sobre um preenchimento do destaque (botão sólido): preto ou branco, a que tiver mais contraste (>= 4,58:1 sempre).
export function accentContrastColor(accent: string): string {
  return contrastRatio('#000000', accent) >= contrastRatio('#ffffff', accent) ? '#000000' : '#ffffff'
}

function rgbHex(r: number, g: number, b: number) {
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`
}
