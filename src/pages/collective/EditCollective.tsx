import { useState } from 'react'
import { useParams } from '../../router'
import { useStore } from '../../context/StoreContext'
import { useToast } from '../../context/ToastContext'
import { usePageTitle } from '../../lib/usePageTitle'
import { useColetivo } from '../../components/layout/CollectiveLayout'
import { Badge, Button, Empty, Panel } from '../../components/ui/primitives'
import { Input, Select, Textarea } from '../../components/ui/form'
import { ESTADOS, type Cargo, type Estado, type NivelCargo } from '../../data/types'

const NIVEIS: { value: NivelCargo; label: string }[] = [
  { value: 0, label: 'Membro (N0) — sem gestão' },
  { value: 1, label: 'Comunicação (N1) — mensagens' },
  { value: 2, label: 'Administrador (N2) — tudo' },
]

export function EditCollective() {
  const { id } = useParams()
  const { col, nivel } = useColetivo(id)
  const { updateColetivo } = useStore()
  const toast = useToast()
  usePageTitle(col ? `${col.nome} · Editar` : 'Editar Coletivo')

  const [form, setForm] = useState(() => ({
    nome: col?.nome ?? '', tipo: col?.tipo ?? 'coletivo', cidade: col?.cidade ?? '', estado: (col?.estado ?? 'PE') as Estado,
    bio: col?.bio ?? '', cnpj: col?.cnpj ?? '',
  }))
  const [cargos, setCargos] = useState<Cargo[]>(col?.cargos ?? [])
  const [novoCargo, setNovoCargo] = useState<{ nome: string; nivel: NivelCargo }>({ nome: '', nivel: 0 })

  if (!col) return null
  if (nivel < 2) return <Empty>Apenas administradores podem editar o coletivo.</Empty>

  const salvar = (e: React.FormEvent) => {
    e.preventDefault()
    if (form.tipo === 'produtora' && !form.cnpj) { toast('Produtora exige CNPJ', 'warn'); return }
    updateColetivo(col.id, { ...form, cargos })
    toast('Coletivo atualizado', 'ok')
  }

  const addCargo = () => {
    if (!novoCargo.nome) return
    setCargos((c) => [...c, { id: Math.random().toString(36).slice(2, 8), nome: novoCargo.nome, nivel: novoCargo.nivel }])
    setNovoCargo({ nome: '', nivel: 0 })
    toast('Cargo criado — salve para aplicar', 'info')
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Panel title="informações">
        <form onSubmit={salvar} className="grid gap-4 sm:grid-cols-2" noValidate>
          <Input label="Nome" value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} required />
          <Select label="Tipo" value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value as never })} options={[{ value: 'coletivo', label: 'Coletivo' }, { value: 'produtora', label: 'Produtora' }]} />
          <Input label="Cidade" value={form.cidade} onChange={(e) => setForm({ ...form, cidade: e.target.value })} />
          <Select label="Estado" value={form.estado} onChange={(e) => setForm({ ...form, estado: e.target.value as Estado })} options={ESTADOS.map((s) => ({ value: s.value, label: s.label }))} />
          <div className="sm:col-span-2"><Textarea label="Bio" value={form.bio} onChange={(e) => setForm({ ...form, bio: e.target.value })} /></div>
          <div className="sm:col-span-2"><Input label="CNPJ" value={form.cnpj} onChange={(e) => setForm({ ...form, cnpj: e.target.value })} required={form.tipo === 'produtora'} hint={form.tipo === 'produtora' ? 'obrigatório' : 'opcional'} /></div>
          <div className="sm:col-span-2"><Button type="submit" variant="solid">salvar</Button></div>
        </form>
      </Panel>

      <Panel title="cargos & privilégios">
        <ul className="space-y-2">
          {cargos.map((c) => (
            <li key={c.id} className="flex items-center justify-between border border-[var(--color-line)] p-2">
              <span className="font-mono text-sm">{c.nome}</span>
              <Badge tone={c.nivel >= 2 ? 'ok' : c.nivel === 1 ? 'accent' : 'neutral'}>nível {c.nivel}</Badge>
            </li>
          ))}
        </ul>
        <div className="mt-4 space-y-3 border-t border-[var(--color-line)] pt-4">
          <p className="font-mono text-xs uppercase tracking-widest text-[var(--color-muted)]">criar cargo customizado</p>
          <Input label="Nome do cargo" value={novoCargo.nome} onChange={(e) => setNovoCargo({ ...novoCargo, nome: e.target.value })} placeholder="ex: Curadoria" />
          <Select label="Nível de privilégio" value={String(novoCargo.nivel)} onChange={(e) => setNovoCargo({ ...novoCargo, nivel: Number(e.target.value) as NivelCargo })} options={NIVEIS.map((n) => ({ value: String(n.value), label: n.label }))} />
          <Button variant="outline" onClick={addCargo}>+ adicionar cargo</Button>
        </div>
      </Panel>
    </div>
  )
}
