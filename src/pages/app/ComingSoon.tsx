import { Link } from '../../router'
import { Panel } from '../../components/ui/primitives'

/** Função do painel ainda não ligada ao banco: aviso claro, sem dados de mentira nem sucesso simulado. */
export function ComingSoon() {
  return (
    <div className="mx-auto max-w-xl py-8">
      <Panel title="em breve">
        <h1 className="font-display text-2xl font-bold text-glow">Em breve</h1>
        <p className="mt-3 text-sm text-[var(--color-muted)]">
          Esta função ainda está em preparação e ficará disponível em uma próxima etapa.
        </p>
        <Link to="/painel" className="mt-4 inline-block font-mono text-sm text-[var(--accent-text)] underline">
          voltar ao dashboard
        </Link>
      </Panel>
    </div>
  )
}
