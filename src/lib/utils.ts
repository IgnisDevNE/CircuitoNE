import { EVENTO_TIPO_LABEL, type Evento } from '../data/types'

export function cx(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(' ')
}

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']

export function fmtData(iso: string) {
  const d = new Date(iso)
  return `${String(d.getDate()).padStart(2, '0')} ${MESES[d.getMonth()]} ${d.getFullYear()}`
}

export function fmtDataHora(iso: string) {
  const d = new Date(iso)
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  return `${fmtData(iso)} · ${hh}:${mm}`
}

export function isFuturo(iso: string) {
  return new Date(iso).getTime() >= Date.now()
}

export function porProximidade(a: Evento, b: Evento) {
  const ta = new Date(a.inicio).getTime()
  const tb = new Date(b.inicio).getTime()
  const fa = ta >= Date.now()
  const fb = tb >= Date.now()
  // Futuros primeiro (mais próximos antes); passados por último (cronológico reverso)
  if (fa && fb) return ta - tb
  if (fa) return -1
  if (fb) return 1
  return tb - ta
}

export function tipoEventoLabel(e: Evento) {
  return e.tipo === 'outros' && e.tipoOutro ? e.tipoOutro : EVENTO_TIPO_LABEL[e.tipo]
}

// ---- input masks ----
/** Formata CPF como 000.000.000-00 a partir dos dígitos digitados. */
export function maskCPF(v: string) {
  const d = v.replace(/\D/g, '').slice(0, 11)
  const p = [d.slice(0, 3), d.slice(3, 6), d.slice(6, 9), d.slice(9, 11)]
  let out = p[0]
  if (p[1]) out += '.' + p[1]
  if (p[2]) out += '.' + p[2]
  if (p[3]) out += '-' + p[3]
  return out
}

/** Formata valor monetário x,xx. Sem vírgula/ponto → assume ,00. Vazio permanece vazio. */
export function maskCache(v: string) {
  const t = v.trim()
  if (!t) return ''
  const num = t.replace(/[^\d.,]/g, '').replace(/\./g, ',')
  const [intRaw, decRaw = ''] = num.split(',')
  const int = (intRaw || '0').replace(/^0+(?=\d)/, '') || '0'
  const dec = (decRaw + '00').slice(0, 2)
  const intFmt = int.replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  return `R$ ${intFmt},${dec}`
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
