import { useState } from 'react'
import { useNavigate } from '../../router'
import { useStore } from '../../context/StoreContext'
import { useToast } from '../../context/ToastContext'
import { usePageTitle } from '../../lib/usePageTitle'
import { ESTADOS, TIPO_LABEL, type Estado } from '../../data/types'
import { Badge, Button, LinkButton, Panel } from '../../components/ui/primitives'
import { Input, Select } from '../../components/ui/form'

export function EditData() {
  usePageTitle('Editar Dados')
  const { user, updateUser } = useStore()
  const toast = useToast()
  const navigate = useNavigate()
  const [form, setForm] = useState(() => ({
    nome: user?.nome ?? '', email: user?.email ?? '', genero: user?.genero ?? '',
    nascimento: user?.nascimento ?? '', cpf: user?.cpf ?? '', cidade: user?.cidade ?? '', estado: (user?.estado ?? 'PE') as Estado,
  }))
  if (!user) return null

  const salvar = (e: React.FormEvent) => {
    e.preventDefault()
    updateUser(form)
    toast('Dados gerais atualizados', 'ok')
  }

  return (
    <div className="max-w-3xl space-y-6">
      <h1 className="font-display text-2xl font-bold text-glow">$ editar_dados</h1>

      <Panel title="dados gerais">
        <form onSubmit={salvar} className="grid gap-4 sm:grid-cols-2" noValidate>
          <Input label="Nome completo" value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} required />
          <Input label="E-mail" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
          <Input label="Gênero" value={form.genero} onChange={(e) => setForm({ ...form, genero: e.target.value })} />
          <Input label="Data de nascimento" type="date" value={form.nascimento} onChange={(e) => setForm({ ...form, nascimento: e.target.value })} />
          <Input label="CPF" value={form.cpf} onChange={(e) => setForm({ ...form, cpf: e.target.value })} />
          <Input label="Cidade" value={form.cidade} onChange={(e) => setForm({ ...form, cidade: e.target.value })} />
          <Select label="Estado" value={form.estado} onChange={(e) => setForm({ ...form, estado: e.target.value as Estado })} options={ESTADOS.map((s) => ({ value: s.value, label: s.label }))} />
          <div className="sm:col-span-2">
            <Button type="submit" variant="solid">salvar dados</Button>
          </div>
        </form>
      </Panel>

      <Panel title="minhas atuações" actions={<LinkButton to="/painel/dados/nova-atuacao" size="sm" variant="outline">+ nova atuação</LinkButton>}>
        <ul className="space-y-2">
          {user.atuacoes.map((a) => (
            <li key={a.id} className="flex items-center justify-between border border-[var(--color-line)] p-3">
              <span className="flex items-center gap-3">
                <Badge tone="accent">{TIPO_LABEL[a.tipo]}</Badge>
                <span className="font-mono text-sm">{a.nome}</span>
              </span>
              {a.tipo === 'artista' && (
                <Button size="sm" variant="ghost" onClick={() => navigate(`/painel/perfil/${a.id}`)}>editar perfil</Button>
              )}
            </li>
          ))}
        </ul>
        <p className="mt-3 font-mono text-xs text-[var(--color-muted)]">
          Você pode ter várias atuações — inclusive múltiplos perfis de artista para projetos diferentes.
        </p>
      </Panel>
    </div>
  )
}
