import { useState } from 'react'
import { useNavigate, useParams } from '../../router'
import { useStore } from '../../context/StoreContext'
import { useToast } from '../../context/ToastContext'
import { usePageTitle } from '../../lib/usePageTitle'
import { useColetivo } from '../../components/layout/CollectiveLayout'
import { Badge, Button, Empty, Panel } from '../../components/ui/primitives'
import { Checkbox, ImageField, Input, Select } from '../../components/ui/form'
import { MarkdownEditor } from '../../components/ui/Markdown'
import { ESTADOS, EVENTO_TIPO_LABEL, type Estado, type EventoTipo } from '../../data/types'

export function CreateEvent() {
  const { id } = useParams()
  const { col, nivel } = useColetivo(id)
  const { artistas, addEvento } = useStore()
  const nav = useNavigate()
  const toast = useToast()
  usePageTitle(col ? `${col.nome} · Criar Evento` : 'Criar Evento')

  const [form, setForm] = useState({
    nome: '', tipo: 'festa' as EventoTipo, tipoOutro: '', descricao: '',
    inicio: '', fim: '', estado: 'PE' as Estado, cidade: '', local: '',
    ingressoLink: '', gratuito: false, capa: '',
  })
  const [lineup, setLineup] = useState<{ artistaId?: string; nome: string }[]>([])
  const [novoArtista, setNovoArtista] = useState('')
  const [erros, setErros] = useState<Record<string, string>>({})

  if (!col) return null
  if (nivel < 2) return <Empty>Apenas administradores (nível 2) podem criar eventos.</Empty>

  const addLineupFromPool = (artistaId: string) => {
    if (!artistaId) return
    const a = artistas.find((x) => x.id === artistaId)
    if (!a || lineup.some((l) => l.artistaId === a.id)) return
    setLineup((l) => [...l, { artistaId: a.id, nome: a.nome }])
  }
  const addLineupFree = () => {
    if (!novoArtista.trim()) return
    setLineup((l) => [...l, { nome: novoArtista.trim() }])
    setNovoArtista('')
  }
  const removeLineup = (i: number) => setLineup((l) => l.filter((_, idx) => idx !== i))

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    const errs: Record<string, string> = {}
    if (!form.nome.trim()) errs.nome = 'Informe o nome do evento.'
    if (form.tipo === 'outros' && !form.tipoOutro.trim()) errs.tipoOutro = 'Descreva o tipo do evento.'
    if (!form.inicio) errs.inicio = 'Informe a data/hora de início.'
    if (!form.cidade.trim()) errs.cidade = 'Informe a cidade.'
    if (!form.local.trim()) errs.local = 'Informe o local.'
    if (!form.gratuito && !form.ingressoLink.trim()) errs.ingressoLink = 'Adicione um link de ingresso ou marque como gratuito.'
    setErros(errs)
    if (Object.keys(errs).length) { toast('Corrija os campos destacados', 'warn'); return }

    addEvento({
      id: '', nome: form.nome.trim(), tipo: form.tipo, tipoOutro: form.tipo === 'outros' ? form.tipoOutro.trim() : undefined,
      descricao: form.descricao, inicio: new Date(form.inicio).toISOString(), fim: form.fim ? new Date(form.fim).toISOString() : new Date(form.inicio).toISOString(),
      estado: form.estado, cidade: form.cidade.trim(), local: form.local.trim(), coletivoId: col.id,
      lineup, ingressoLink: form.gratuito ? undefined : form.ingressoLink.trim(), gratuito: form.gratuito,
      capa: form.capa.trim() || 'https://images.unsplash.com/photo-1571266028243-e4733b0f3a0e?auto=format&fit=crop&w=1200&q=60',
    })
    toast('Evento criado', 'ok')
    nav(`/coletivo/${col.id}/painel`)
  }

  return (
    <form onSubmit={submit} className="grid gap-6 lg:grid-cols-2" noValidate>
      <Panel title="detalhes do evento">
        <div className="grid gap-4">
          <Input label="Nome do evento" value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} required error={erros.nome} />
          <div className="grid gap-4 sm:grid-cols-2">
            <Select label="Tipo" value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value as EventoTipo })}
              options={(Object.keys(EVENTO_TIPO_LABEL) as EventoTipo[]).map((t) => ({ value: t, label: EVENTO_TIPO_LABEL[t] }))} />
            {form.tipo === 'outros' && (
              <Input label="Qual tipo?" value={form.tipoOutro} onChange={(e) => setForm({ ...form, tipoOutro: e.target.value })} required error={erros.tipoOutro} />
            )}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Input label="Início" type="datetime-local" value={form.inicio} onChange={(e) => setForm({ ...form, inicio: e.target.value })} required error={erros.inicio} />
            <Input label="Fim" type="datetime-local" value={form.fim} onChange={(e) => setForm({ ...form, fim: e.target.value })} hint="opcional" />
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <Select label="Estado" value={form.estado} onChange={(e) => setForm({ ...form, estado: e.target.value as Estado })} options={ESTADOS.map((s) => ({ value: s.value, label: s.label }))} />
            <Input label="Cidade" value={form.cidade} onChange={(e) => setForm({ ...form, cidade: e.target.value })} required error={erros.cidade} />
            <Input label="Local" value={form.local} onChange={(e) => setForm({ ...form, local: e.target.value })} required error={erros.local} />
          </div>
          <ImageField label="Imagem de capa" value={form.capa} onChange={(v) => setForm({ ...form, capa: v })} hint="URL ou upload — usa uma capa padrão se vazio" />
        </div>
      </Panel>

      <div className="space-y-6">
        <Panel title="descrição (markdown)">
          <label htmlFor="ev-desc" className="mb-1 block font-mono text-xs uppercase tracking-widest text-[var(--color-muted)]"><span aria-hidden className="text-[var(--accent-text)]">$ </span>descrição</label>
          <MarkdownEditor id="ev-desc" value={form.descricao} onChange={(v) => setForm({ ...form, descricao: v })} />
        </Panel>

        <Panel title="lineup">
          <div className="grid gap-3 sm:grid-cols-2">
            <Select label="Do hub" value="" onChange={(e) => addLineupFromPool(e.target.value)}
              options={[{ value: '', label: '— selecionar artista —' }, ...artistas.map((a) => ({ value: a.id, label: a.nome }))]} />
            <div className="flex items-end gap-2">
              <div className="flex-1"><Input label="Nome livre" value={novoArtista} onChange={(e) => setNovoArtista(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addLineupFree() } }} /></div>
              <Button type="button" variant="outline" onClick={addLineupFree}>+</Button>
            </div>
          </div>
          {lineup.length > 0 && (
            <ul className="mt-3 flex flex-wrap gap-2">
              {lineup.map((l, i) => (
                <li key={i}>
                  <button type="button" onClick={() => removeLineup(i)} className="inline-flex items-center gap-2 border border-[var(--color-line)] px-2 py-1 font-mono text-xs hover:border-[var(--accent)]">
                    {l.nome} {l.artistaId && <Badge tone="accent">hub</Badge>} <span aria-hidden>✕</span><span className="sr-only">remover</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="ingresso">
          <Checkbox label="Evento gratuito" checked={form.gratuito} onChange={(e) => setForm({ ...form, gratuito: e.target.checked })} />
          {!form.gratuito && (
            <div className="mt-3"><Input label="Link de ingresso" value={form.ingressoLink} onChange={(e) => setForm({ ...form, ingressoLink: e.target.value })} placeholder="https://" error={erros.ingressoLink} /></div>
          )}
        </Panel>

        <Button type="submit" variant="solid" className="w-full">publicar evento</Button>
      </div>
    </form>
  )
}
