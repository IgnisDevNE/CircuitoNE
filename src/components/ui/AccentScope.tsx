import type { CSSProperties, ReactNode } from 'react'
import { accentContrastColor, accentTextColor, ensureAccent } from '../../lib/utils'

/**
 * Injects a per-user / per-collective accent into a subtree via CSS variables.
 * Colors are validated to a WCAG contrast floor before use.
 */
export function AccentScope({ color, children, className }: { color: string; children: ReactNode; className?: string }) {
  const accent = ensureAccent(color)
  const accentText = accentTextColor(color)
  // `--accent-contrast`: texto sobre o preenchimento do destaque (botão sólido), sempre com contraste de 4,5:1 ou mais.
  const style = { '--accent': accent, '--accent-text': accentText, '--accent-contrast': accentContrastColor(accent) } as CSSProperties
  return (
    <div style={style} className={className}>
      {children}
    </div>
  )
}
