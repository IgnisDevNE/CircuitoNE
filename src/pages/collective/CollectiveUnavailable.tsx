import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { Badge, Panel } from '../../components/ui/primitives'
import type { ColetivoArea, SituacaoBloqueada } from '../../server/mappers/collective-area'

const TEXTOS: Record<SituacaoBloqueada, { rotulo: string; explicacao: string }> = {
  pending: {
    rotulo: 'em análise',
    explicacao:
      'A administração do site ainda está verificando este coletivo. Dashboard, eventos, mensagens e as demais funções internas ficam disponíveis somente depois da aprovação.',
  },
  rejected: {
    rotulo: 'recusado',
    explicacao: 'A administração do site recusou este cadastro, então as funções internas continuam bloqueadas.',
  },
  suspended: {
    rotulo: 'suspenso',
    explicacao:
      'A administração do site suspendeu este coletivo. As funções internas e o perfil público ficam indisponíveis até uma eventual reativação.',
  },
}

/**
 * Estado de um coletivo ainda não aprovado (RN-30): explica a situação e não oferece nenhuma função interna.
 * Quem criou o pedido (pendente ou recusado) pode abrir a correção dos dados: `editarHref` leva até ela e, dentro dela,
 * `children` traz o formulário no lugar do atalho. Nada mais do coletivo abre antes da aprovação.
 */
export function CollectiveUnavailable({
  coletivo,
  situacao,
  motivo,
  editarHref,
  children,
}: {
  coletivo: Pick<ColetivoArea, 'nome' | 'cargo' | 'dono'>
  situacao: SituacaoBloqueada
  motivo: string | null
  editarHref?: string
  children?: ReactNode
}) {
  const texto = TEXTOS[situacao]
  return (
    <div className="space-y-6">
      <header className="border-b border-[var(--color-line)] pb-4">
        <Link to="/painel/coletivos" className="font-mono text-xs text-[var(--color-muted)] hover:text-[var(--accent-text)]">← meus coletivos</Link>
        <h1 className="mt-1 font-display text-2xl font-bold text-glow">{coletivo.nome}</h1>
        <p className="mt-2 flex flex-wrap items-center gap-2 font-mono text-xs text-[var(--color-muted)]">
          <span>{coletivo.dono ? `${coletivo.cargo} · responsável` : coletivo.cargo}</span>
          <Badge tone="warn">{texto.rotulo}</Badge>
        </p>
      </header>
      <Panel title="situação do coletivo">
        <p role="status" className="text-sm">{texto.explicacao}</p>
        {motivo && (
          <p className="mt-3 border-l-2 border-[var(--color-line)] pl-3 font-mono text-sm text-[var(--color-muted)]">
            Motivo informado: {motivo}
          </p>
        )}
        {editarHref && !children && (
          <p className="mt-4">
            <Link to={editarHref} className="font-mono text-sm text-[var(--accent-text)] underline">
              {situacao === 'rejected' ? 'corrigir os dados e reenviar' : 'corrigir os dados do pedido'}
            </Link>
          </p>
        )}
        <Link to="/painel/coletivos" className="mt-4 inline-block font-mono text-sm text-[var(--accent-text)] underline">
          voltar para meus coletivos
        </Link>
      </Panel>
      {children}
    </div>
  )
}
