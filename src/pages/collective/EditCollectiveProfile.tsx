import { useState } from 'react'
import { Link, useParams } from '../../router'
import { useStore } from '../../context/StoreContext'
import { useToast } from '../../context/ToastContext'
import { usePageTitle } from '../../lib/usePageTitle'
import { useColetivo } from '../../components/layout/CollectiveLayout'
import { Button, Empty, Panel } from '../../components/ui/primitives'
import { ImageField, Input, Textarea } from '../../components/ui/form'
import { AccentScope } from '../../components/ui/AccentScope'

export function EditCollectiveProfile() {
  const { id } = useParams()
  const { col, nivel } = useColetivo(id)
  const { updateColetivo } = useStore()
  const toast = useToast()
  usePageTitle(col ? `${col.nome} · Perfil` : 'Perfil')

  const [form, setForm] = useState(() => ({
    bio: col?.bio ?? '', imagem: col?.imagem ?? '', cor: col?.corPredominante ?? '#ff2040',
    instagram: col?.social.instagram ?? '', site: col?.social.site ?? '',
  }))

  if (!col) return null
  if (nivel < 2) return <Empty>Apenas administradores podem editar o perfil público.</Empty>

  const salvar = (e: React.FormEvent) => {
    e.preventDefault()
    updateColetivo(col.id, { bio: form.bio, imagem: form.imagem, corPredominante: form.cor, social: { ...col.social, instagram: form.instagram, site: form.site } })
    toast('Perfil público atualizado', 'ok')
  }

  return (
    <AccentScope color={form.cor}>
      <Panel title="perfil público do coletivo">
        <form onSubmit={salvar} className="grid gap-4 sm:grid-cols-2" noValidate>
          <div className="sm:col-span-2"><Textarea label="Bio pública" value={form.bio} onChange={(e) => setForm({ ...form, bio: e.target.value })} /></div>
          <div className="sm:col-span-2"><ImageField label="Imagem de capa" value={form.imagem} onChange={(v) => setForm({ ...form, imagem: v })} hint="URL ou upload" /></div>
          <Input label="Instagram" value={form.instagram} onChange={(e) => setForm({ ...form, instagram: e.target.value })} placeholder="@coletivo" />
          <Input label="Site" value={form.site} onChange={(e) => setForm({ ...form, site: e.target.value })} placeholder="https://" />
          <div>
            <label htmlFor="cor" className="mb-1 block font-mono text-xs uppercase tracking-widest text-[var(--color-muted)]"><span className="text-[var(--accent-text)]">$ </span>cor predominante</label>
            <input id="cor" type="color" value={form.cor} onChange={(e) => setForm({ ...form, cor: e.target.value })} className="h-10 w-16 cursor-pointer border border-[var(--color-line)] bg-transparent" />
          </div>
          <div className="sm:col-span-2 flex gap-3">
            <Button type="submit" variant="solid">salvar</Button>
            <Link to={`/coletivos/${col.id}`} className="inline-flex items-center font-mono text-sm text-[var(--accent-text)] hover:underline">ver perfil público ↗</Link>
          </div>
        </form>
      </Panel>
    </AccentScope>
  )
}
