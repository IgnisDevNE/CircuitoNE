import type { CSSProperties, ReactNode } from 'react'
import { accentTextColor, ensureAccent } from '../../lib/utils'

/**
 * Injects a per-user / per-collective accent into a subtree via CSS variables.
 * Colors are validated to a WCAG contrast floor before use.
 */
export function AccentScope({ color, children, className }: { color: string; children: ReactNode; className?: string }) {
  const accent = ensureAccent(color)
  const accentText = accentTextColor(color)
  const style = { '--accent': accent, '--accent-text': accentText } as CSSProperties
  return (
    <div style={style} className={className}>
      {children}
    </div>
  )
}
