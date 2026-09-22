import { useState } from 'react'
import { Link } from '../../router'
import { useStore } from '../../context/StoreContext'
import { useToast } from '../../context/ToastContext'
import { usePageTitle } from '../../lib/usePageTitle'
import { Badge, Button, Empty, Panel } from '../../components/ui/primitives'
import { Modal } from '../../components/ui/Modal'
import { Select } from '../../components/ui/form'
import { AccentScope } from '../../components/ui/AccentScope'

export function MyCollectives() {
  usePageTitle('Meus Coletivos')
  const { user, coletivos } = useStore()
  const toast = useToast()
  const [modal, setModal] = useState<null | 'solicitar'>(null)
  const [alvo, setAlvo] = useState('')

  if (!user) return null
  const meus = coletivos.filter((c) => c.membros.some((m) => m.userId === user.id))
  const outros = coletivos.filter((c) => !meus.includes(c))

  const cargoDoUsuario = (colId: string) => {
    const col = coletivos.find((c) => c.id === colId)
    const m = col?.membros.find((x) => x.userId === user.id)
    return col?.cargos.find((c) => c.id === m?.cargoId)
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-2xl font-bold text-glow">$ coletivos_e_produtoras</h1>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setModal('solicitar')}>solicitar acesso</Button>
          <Link to="/painel/dados/nova-atuacao" className="inline-flex items-center border border-[var(--accent)] px-3 py-1.5 font-mono text-xs uppercase tracking-widest hover:bg-[var(--accent)]/15">criar novo</Link>
        </div>
      </div>

      {meus.length === 0 ? (
        <Empty>Você ainda não faz parte de nenhum coletivo/produtora.</Empty>
      ) : (
        <ul className="grid gap-4 md:grid-cols-2">
          {meus.map((c) => {
            const cargo = cargoDoUsuario(c.id)
            return (
              <li key={c.id}>
                <AccentScope color={c.corPredominante}>
                  <Panel title={c.tipo}>
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <h2 className="font-display text-lg font-bold">{c.nome}</h2>
                        <p className="font-mono text-xs text-[var(--color-muted)]">{c.cidade}/{c.estado}</p>
                      </div>
                      <Badge tone={cargo && cargo.nivel >= 2 ? 'ok' : 'accent'}>{cargo?.nome ?? 'membro'} · N{cargo?.nivel ?? 0}</Badge>
                    </div>
                    <p className="mt-3 line-clamp-2 text-sm text-[var(--color-muted)]">{c.bio}</p>
                    <div className="mt-4 flex gap-2">
                      <Link to={`/coletivo/${c.id}/painel`} className="inline-flex items-center border border-[var(--accent)] px-3 py-1.5 font-mono text-xs uppercase tracking-widest hover:bg-[var(--accent)]/15">abrir dashboard →</Link>
                      <Link to={`/coletivos/${c.id}`} className="inline-flex items-center font-mono text-xs text-[var(--accent-text)] hover:underline">perfil público</Link>
                    </div>
                  </Panel>
                </AccentScope>
              </li>
            )
          })}
        </ul>
      )}

      <Modal open={modal === 'solicitar'} onClose={() => setModal(null)} title="solicitar acesso">
        <div className="space-y-4">
          <p className="font-mono text-sm text-[var(--color-muted)]">Escolha um coletivo/produtora para enviar sua solicitação de acesso.</p>
          <Select label="Coletivo/Produtora" value={alvo} onChange={(e) => setAlvo(e.target.value)}
            options={[{ value: '', label: '— selecione —' }, ...outros.map((c) => ({ value: c.id, label: `${c.nome} (${c.tipo})` }))]} />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setModal(null)}>cancelar</Button>
            <Button variant="solid" disabled={!alvo} onClick={() => { toast('Solicitação de acesso enviada', 'info'); setModal(null); setAlvo('') }}>enviar solicitação</Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
