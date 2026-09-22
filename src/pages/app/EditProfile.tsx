import { useState } from 'react'
import { Link, useParams } from '../../router'
import { useStore } from '../../context/StoreContext'
import { useToast } from '../../context/ToastContext'
import { usePageTitle } from '../../lib/usePageTitle'
import { Button, Empty, Panel } from '../../components/ui/primitives'
import { Input, Textarea } from '../../components/ui/form'
import { AccentScope } from '../../components/ui/AccentScope'

export function EditProfile() {
  const { atuacaoId } = useParams()
  const { user } = useStore()
  const toast = useToast()
  const atuacao = user?.atuacoes.find((a) => a.id === atuacaoId)
  usePageTitle(atuacao ? `Editar ${atuacao.nome}` : 'Editar Perfil')

  const artista = atuacao?.tipo === 'artista' ? atuacao : null
  const [form, setForm] = useState(() => ({
    nome: artista?.nome ?? '',
    bio: artista?.bio ?? '',
    estilos: artista?.estilos.join(', ') ?? '',
    cor: artista?.corPredominante ?? '#ff2040',
    emailBooking: artista?.emailBooking ?? '',
    mediaCache: artista?.mediaCache ?? '',
    presskit: artista?.presskit ?? '',
  }))

  if (!atuacao) return <Empty>Atuação não encontrada. <Link to="/painel/dados" className="text-[var(--accent-text)] underline">voltar</Link></Empty>
  if (!artista)
    return (
      <Empty>
        Somente atuações de <strong>Artista</strong> possuem perfil público editável.{' '}
        <Link to="/painel/dados" className="text-[var(--accent-text)] underline">editar dados</Link>
      </Empty>
    )

  const salvar = (e: React.FormEvent) => {
    e.preventDefault()
    toast(`Perfil de "${form.nome}" atualizado`, 'ok')
  }

  return (
    <AccentScope color={form.cor}>
      <div className="max-w-3xl space-y-6">
        <h1 className="font-display text-2xl font-bold text-glow">$ editar_perfil · {artista.nome}</h1>

        <Panel title="perfil de artista">
          <form onSubmit={salvar} className="grid gap-4 sm:grid-cols-2" noValidate>
            <Input label="Nome artístico" value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} required />
            <Input label="E-mail booking" type="email" value={form.emailBooking} onChange={(e) => setForm({ ...form, emailBooking: e.target.value })} />
            <div className="sm:col-span-2">
              <Textarea label="Bio" value={form.bio} onChange={(e) => setForm({ ...form, bio: e.target.value })} />
            </div>
            <Input label="Estilos" value={form.estilos} onChange={(e) => setForm({ ...form, estilos: e.target.value })} hint="separe por vírgula" />
            <Input label="Média de cachê" value={form.mediaCache} onChange={(e) => setForm({ ...form, mediaCache: e.target.value })} />
            <Input label="Presskit (URL)" value={form.presskit} onChange={(e) => setForm({ ...form, presskit: e.target.value })} placeholder="https://" />
            <div>
              <label htmlFor="cor" className="mb-1 block font-mono text-xs uppercase tracking-widest text-[var(--color-muted)]"><span className="text-[var(--accent-text)]">$ </span>cor predominante</label>
              <input id="cor" type="color" value={form.cor} onChange={(e) => setForm({ ...form, cor: e.target.value })} className="h-10 w-16 cursor-pointer border border-[var(--color-line)] bg-transparent" />
            </div>
            <div className="sm:col-span-2 flex gap-3">
              <Button type="submit" variant="solid">salvar perfil</Button>
              <Link to={`/artistas/${artista.id}`} className="inline-flex items-center font-mono text-sm text-[var(--accent-text)] hover:underline">ver perfil público ↗</Link>
            </div>
          </form>
        </Panel>
      </div>
    </AccentScope>
  )
}
