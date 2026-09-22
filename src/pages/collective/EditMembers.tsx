import { useParams } from '../../router'
import { useStore } from '../../context/StoreContext'
import { useToast } from '../../context/ToastContext'
import { usePageTitle } from '../../lib/usePageTitle'
import { useColetivo } from '../../components/layout/CollectiveLayout'
import { Avatar, Button, Empty, Panel } from '../../components/ui/primitives'

export function EditMembers() {
  const { id } = useParams()
  const { col, nivel } = useColetivo(id)
  const { updateColetivo } = useStore()
  const toast = useToast()
  usePageTitle(col ? `${col.nome} · Membros` : 'Membros')

  if (!col) return null
  if (nivel < 2) return <Empty>Apenas administradores (nível 2) podem editar membros.</Empty>

  const setCargo = (userId: string, cargoId: string) => {
    updateColetivo(col.id, { membros: col.membros.map((m) => (m.userId === userId ? { ...m, cargoId } : m)) })
    toast('Cargo atualizado', 'ok')
  }
  const remover = (userId: string, nome: string) => {
    updateColetivo(col.id, { membros: col.membros.filter((m) => m.userId !== userId) })
    toast(`${nome} removido do coletivo`, 'warn')
  }

  return (
    <Panel title="gerenciar membros">
      <ul className="space-y-2">
        {col.membros.map((m) => (
          <li key={m.userId} className="flex flex-wrap items-center gap-3 border border-[var(--color-line)] p-3">
            <Avatar alt={m.nome} size={36} />
            <span className="min-w-0 flex-1">
              <span className="block truncate font-mono text-sm">{m.nome}</span>
              <span className="block font-mono text-xs text-[var(--color-muted)]">visto {m.lastSeen}</span>
            </span>
            <label className="sr-only" htmlFor={`cargo-${m.userId}`}>Cargo de {m.nome}</label>
            <select
              id={`cargo-${m.userId}`}
              value={m.cargoId}
              onChange={(e) => setCargo(m.userId, e.target.value)}
              className="bg-[var(--color-bg-elev)] border border-[var(--color-line)] px-2 py-1.5 font-mono text-xs outline-none focus:border-[var(--accent)]"
            >
              {col.cargos.map((c) => (
                <option key={c.id} value={c.id}>{c.nome} (N{c.nivel})</option>
              ))}
            </select>
            <Button size="sm" variant="danger" onClick={() => remover(m.userId, m.nome)}>remover</Button>
          </li>
        ))}
      </ul>
    </Panel>
  )
}
