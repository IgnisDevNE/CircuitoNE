import { Badge } from './primitives'

export const MFA_DEV_NOTICE = 'Esta parte vai exigir verificação em duas etapas (MFA) quando a aplicação estiver em produção.'

/**
 * Aviso do ambiente de desenvolvimento: onde a verificação em duas etapas (MFA) é exigida em produção, o dev não a exige
 * (flag `mfa_optional`). Só renderiza quando a flag está ligada; a regra de verdade continua no banco.
 */
export function MfaDevNotice({ show, className }: { show?: boolean; className?: string }) {
  if (!show) return null
  return (
    <p role="note" className={`flex flex-wrap items-center gap-2 border border-dashed border-[var(--color-warn)] p-2 font-mono text-xs ${className ?? ''}`}>
      <Badge tone="warn">ambiente dev</Badge>
      <span>{MFA_DEV_NOTICE}</span>
    </p>
  )
}
