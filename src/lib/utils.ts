import { EVENTO_TIPO_LABEL, type Evento } from '../data/types'

export function cx(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(' ')
}

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

export function porProximidade(a: Evento, b: Evento, now = Date.now()) {
  const ta = new Date(a.inicio).getTime()
  const tb = new Date(b.inicio).getTime()
  const fa = eventoNaoEncerrado(a, now)
  const fb = eventoNaoEncerrado(b, now)
  // Em andamento primeiro; futuros por proximidade; passados do mais recente para o mais antigo.
  if (fa && fb) return Math.max(ta, now) - Math.max(tb, now) || ta - tb || a.id.localeCompare(b.id)
  if (fa) return -1
  if (fb) return 1
  return tb - ta || a.id.localeCompare(b.id)
}

export function tipoEventoLabel(e: Evento) {
  return e.tipo === 'outros' && e.tipoOutro ? e.tipoOutro : EVENTO_TIPO_LABEL[e.tipo]
}

// ---- input masks ----
/** Formata CPF parcial sem apagar entradas inválidas que precisam ser corrigidas. */
export function maskCPF(v: string) {
  const d = v.replace(/[.\-\s]/g, '')
  if (!/^\d{0,11}$/.test(d)) return v
  const p = [d.slice(0, 3), d.slice(3, 6), d.slice(6, 9), d.slice(9, 11)]
  let out = p[0]
  if (p[1]) out += '.' + p[1]
  if (p[2]) out += '.' + p[2]
  if (p[3]) out += '-' + p[3]
  return out
}

/** Lê uma quantia única em reais no formato brasileiro e devolve centavos inteiros. */
export function parseCacheCents(v: string): number | null {
  const match = /^(?:R\$\s*)?(\d{1,3}(?:\.\d{3})+|\d+)(?:,(\d{1,2}))?$/.exec(v.trim())
  if (!match) return null
  const cents = Number(match[1].replace(/\./g, '')) * 100 + Number((match[2] ?? '').padEnd(2, '0'))
  return Number.isSafeInteger(cents) ? cents : null
}

/** Vazio permanece vazio; entrada inválida permanece visível para correção. */
export function maskCache(v: string) {
  if (!v.trim()) return ''
  const cents = parseCacheCents(v)
  if (cents === null) return v
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
  return 0.2126 * a[0] + 0.7152 * a[1] + 0.7222 * a[2]
}

export function contrastRatio(fg: string, bg: string) {
  const l1 = luminance(hexToRgb(fg))
  const l2 = luminance(hexToRgb(bg))
  const [hi, lo] = l1 > l2 ? [l1, l2] : [l2, l1]
  return (hi + 0.05) / (lo + 0.05)
}

// Ensure an accent color is bright enough to serve as non-text UI (>= 3:1 on black).
// If too dark, lighten it toward white until it clears the floor.
export function ensureAccent(hex: string, bg = '#050506', floor = 3): string {
  try {
    let [r, g, b] = hexToRgb(hex)
    let steps = 0
    while (contrastRatio(rgbHex(r, g, b), bg) < floor && steps < 20) {
      r = Math.min(255, Math.round(r + (255 - r) * 0.15))
      g = Math.min(255, Math.round(g + (255 - g) * 0.15))
      b = Math.min(255, Math.round(b + (255 - b) * 0.15))
      steps++
    }
    return rgbHex(r, g, b)
  } catch {
    return '#ff2040'
  }
}

// Lighter variant for accent-as-small-text (aim >= 4.5:1 on black).
export function accentTextColor(hex: string, bg = '#050506'): string {
  let [r, g, b] = hexToRgb(hex)
  let steps = 0
  while (contrastRatio(rgbHex(r, g, b), bg) < 4.5 && steps < 30) {
    r = Math.min(255, Math.round(r + (255 - r) * 0.12))
    g = Math.min(255, Math.round(g + (255 - g) * 0.12))
    b = Math.min(255, Math.round(b + (255 - b) * 0.12))
    steps++
  }
  return rgbHex(r, g, b)
}

function rgbHex(r: number, g: number, b: number) {
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`
}
