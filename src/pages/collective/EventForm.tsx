import { useId, useState } from 'react'
import { Form } from 'react-router'
import { ESTADOS, EVENTO_TIPO_LABEL, type Estado, type EventoTipo } from '../../data/types'
import { encodeLineupEntry, LINEUP_MAX, type LineupEntry } from '../../lib/event-form'
import { toFortalezaInput } from '../../lib/utils'
import type { ArtistaOpcao, EventoGerido } from '../../server/mappers/events-manage'
import { Badge, Button, Panel } from '../../components/ui/primitives'
import { Checkbox, Input, Select } from '../../components/ui/form'
import { FileField } from '../../components/ui/FileField'
import { IMAGE_MAX_BYTES } from '../../lib/uploads'
import { Markdown, MarkdownEditor } from '../../components/ui/Markdown'

/** Valores do formulário, nos mesmos termos da página: horários como `datetime-local` em Fortaleza. */
export type EventFormValues = {
  nome: string
  tipo: EventoTipo
  tipoOutro: string
  descricao: string
  inicio: string
  fim: string
  estado: Estado
  cidade: string
  local: string
  gratuito: boolean
  ingressoLink: string
  capa: string
  lineup: LineupEntry[]
}

export const EMPTY_EVENT_VALUES: EventFormValues = {
  nome: '',
  tipo: 'festa',
  tipoOutro: '',
  descricao: '',
  inicio: '',
  fim: '',
  estado: 'PE',
  cidade: '',
  local: '',
  gratuito: false,
  ingressoLink: '',
  capa: '',
  lineup: [],
}

export const eventToFormValues = (evento: EventoGerido): EventFormValues => ({
  nome: evento.nome,
  tipo: evento.tipo,
  tipoOutro: evento.tipoOutro,
  descricao: evento.descricao,
  inicio: toFortalezaInput(evento.inicio),
  fim: evento.fim ? toFortalezaInput(evento.fim) : '',
  estado: evento.estado,
  cidade: evento.cidade,
  local: evento.local,
  gratuito: evento.gratuito,
  ingressoLink: evento.ingressoLink,
  capa: evento.capa,
  lineup: evento.lineup,
})

const normalize = (value: string) => value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

export interface EventFormProps {
  initial: EventFormValues
  artistas: ArtistaOpcao[]
  /** Mensagem de cada campo recusado na última tentativa (chave = nome do campo). */
  errors?: Record<string, string>
  busy?: boolean
  /** Campos ocultos do envio: `intent`, `request` (criar) ou `version` (editar). */
  hidden: Record<string, string>
  submitLabel: string
  /** Aviso mostrado acima do botão, por exemplo que a alteração fica pública na hora. */
  note?: string
  /**
   * Envio de capa (só na edição: o caminho do arquivo leva o id do evento, que só existe depois de criado).
   * `capaEnviada` é a URL pública da capa já enviada, se houver.
   */
  upload?: { capaEnviada: string | null }
}

/** Formulário de evento compartilhado por "criar" e "editar": o envio é um POST para a ação da rota. */
export function EventForm({ initial, artistas, errors = {}, busy = false, hidden, submitLabel, note, upload }: EventFormProps) {
  const [form, setForm] = useState(initial)
  const [busca, setBusca] = useState('')
  const [nomeLivre, setNomeLivre] = useState('')
  const descId = useId()
  const set = <K extends keyof EventFormValues>(key: K, value: EventFormValues[K]) => setForm((current) => ({ ...current, [key]: value }))

  const filtered = artistas.filter((a) => !form.lineup.some((l) => l.artistaId === a.id) && normalize(a.nome).includes(normalize(busca.trim())))
  const addArtist = (id: string) => {
    const artist = artistas.find((a) => a.id === id)
    if (artist && form.lineup.length < LINEUP_MAX) set('lineup', [...form.lineup, { artistaId: artist.id, nome: artist.nome }])
  }
  const addFree = () => {
    const nome = nomeLivre.trim()
    if (!nome || form.lineup.length >= LINEUP_MAX) return
    set('lineup', [...form.lineup, { nome }])
    setNomeLivre('')
  }

  return (
    <Form method="post" encType={upload ? 'multipart/form-data' : undefined} className="grid gap-6 lg:grid-cols-2" noValidate>
      {Object.entries(hidden).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      <Panel title="detalhes do evento">
        <div className="grid gap-4">
          <Input label="Nome do evento" name="name" value={form.nome} onChange={(e) => set('nome', e.target.value)} required maxLength={200} error={errors.name} />
          <div className="grid gap-4 sm:grid-cols-2">
            <Select
              label="Tipo"
              name="kind"
              value={form.tipo}
              onChange={(e) => set('tipo', e.target.value as EventoTipo)}
              error={errors.kind}
              options={(Object.keys(EVENTO_TIPO_LABEL) as EventoTipo[]).map((t) => ({ value: t, label: EVENTO_TIPO_LABEL[t] }))}
            />
            {form.tipo === 'outros' && (
              <Input label="Qual tipo?" name="other_kind" value={form.tipoOutro} onChange={(e) => set('tipoOutro', e.target.value)} required maxLength={200} error={errors.other_kind} />
            )}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Input label="Início (Fortaleza)" name="starts_at" type="datetime-local" value={form.inicio} onChange={(e) => set('inicio', e.target.value)} required error={errors.starts_at} />
            <Input label="Fim (Fortaleza)" name="ends_at" type="datetime-local" value={form.fim} onChange={(e) => set('fim', e.target.value)} hint="opcional; depois do início" error={errors.ends_at} />
          </div>
          <p className="font-mono text-xs text-[var(--color-muted)]">Horários no fuso de Fortaleza (UTC−03:00), qualquer que seja o seu fuso.</p>
          <div className="grid gap-4 sm:grid-cols-3">
            <Select label="Estado" name="state_code" value={form.estado} onChange={(e) => set('estado', e.target.value as Estado)} error={errors.state_code} options={ESTADOS.map((s) => ({ value: s.value, label: s.label }))} />
            <Input label="Cidade" name="city" value={form.cidade} onChange={(e) => set('cidade', e.target.value)} required maxLength={150} error={errors.city} />
            <Input label="Local" name="venue" value={form.local} onChange={(e) => set('local', e.target.value)} required maxLength={500} error={errors.venue} />
          </div>
          <Input
            label="Imagem de capa (link)"
            name="cover_url"
            type="url"
            inputMode="url"
            value={form.capa}
            onChange={(e) => set('capa', e.target.value)}
            placeholder="https://"
            hint={upload ? 'opcional; informar um link remove a capa enviada' : 'opcional; sem link, o evento usa a capa padrão'}
            error={errors.cover_url}
          />
          {upload ? (
            <div className="space-y-3 border border-[var(--color-line)] p-3">
              {upload.capaEnviada ? (
                <>
                  <img src={upload.capaEnviada} alt={`Capa enviada do evento ${initial.nome}`} className="aspect-[16/9] w-full max-w-sm border border-[var(--color-line)] object-cover" />
                  <Checkbox label="Remover a capa enviada" name="remove_cover" />
                </>
              ) : (
                <p className="font-mono text-xs text-[var(--color-muted)]">Nenhuma capa enviada.</p>
              )}
              <FileField
                label={upload.capaEnviada ? 'Substituir a capa (arquivo)' : 'Enviar capa (arquivo)'}
                kind="image"
                name="cover_file"
                required={false}
                error={errors.cover_file}
                hint={`opcional; JPG, PNG ou WebP, até ${(IMAGE_MAX_BYTES / 1_000_000).toLocaleString('pt-BR')} MB. A capa enviada vale mais que o link e é salva com o evento.`}
              />
            </div>
          ) : (
            <p className="font-mono text-xs text-[var(--color-muted)]">O envio de uma imagem de capa fica disponível depois de criar o rascunho, na página do evento.</p>
          )}
        </div>
      </Panel>

      <div className="space-y-6">
        <Panel title="descrição (markdown)">
          <label htmlFor={descId} className="mb-1 block font-mono text-xs uppercase tracking-widest text-[var(--color-muted)]">
            <span aria-hidden className="text-[var(--accent-text)]">$ </span>descrição
          </label>
          <MarkdownEditor
            id={descId}
            name="description"
            value={form.descricao}
            onChange={(v) => set('descricao', v)}
            invalid={!!errors.description}
            describedBy={errors.description ? `${descId}-erro` : undefined}
          />
          {errors.description && <p id={`${descId}-erro`} className="mt-1 font-mono text-xs text-[var(--accent-text)]">[erro] {errors.description}</p>}
          <div className="mt-4 border-t border-[var(--color-line)] pt-3" aria-label="Pré-visualização da descrição">
            <p className="mb-2 font-mono text-xs uppercase tracking-widest text-[var(--color-muted)]">pré-visualização (como na página pública)</p>
            {form.descricao.trim() ? <Markdown source={form.descricao} /> : <p className="font-mono text-xs text-[var(--color-muted)]">Nada para mostrar ainda.</p>}
          </div>
        </Panel>

        <Panel title="lineup">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-3">
              <Input
                label="Buscar artista do hub"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="nome do artista"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') e.preventDefault()
                }}
              />
              <Select
                label="Artista do hub"
                value=""
                onChange={(e) => addArtist(e.target.value)}
                hint={artistas.length === 0 ? 'Nenhum artista público no hub ainda.' : filtered.length === 0 ? 'Nenhum artista encontrado.' : undefined}
                options={[{ value: '', label: '— selecionar artista —' }, ...filtered.map((a) => ({ value: a.id, label: a.nome }))]}
              />
            </div>
            <div className="flex items-end gap-2">
              <div className="flex-1">
                <Input
                  label="Nome livre"
                  value={nomeLivre}
                  onChange={(e) => setNomeLivre(e.target.value)}
                  maxLength={200}
                  hint="sem vínculo nem link"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      addFree()
                    }
                  }}
                />
              </div>
              <Button type="button" variant="outline" onClick={addFree} aria-label="Adicionar nome livre ao lineup">+</Button>
            </div>
          </div>
          {form.lineup.length > 0 ? (
            <ul className="mt-3 flex flex-wrap gap-2" aria-label="Lineup do evento">
              {form.lineup.map((entry, i) => (
                <li key={`${encodeLineupEntry(entry)}-${i}`}>
                  <input type="hidden" name="lineup" value={encodeLineupEntry(entry)} />
                  <button
                    type="button"
                    onClick={() => set('lineup', form.lineup.filter((_, index) => index !== i))}
                    className="inline-flex items-center gap-2 border border-[var(--color-line)] px-2 py-1 font-mono text-xs hover:border-[var(--accent)]"
                  >
                    {entry.nome} {entry.artistaId && <Badge tone="accent">hub</Badge>} <span aria-hidden>✕</span>
                    <span className="sr-only">remover {entry.nome}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 font-mono text-xs text-[var(--color-muted)]">Lineup vazio. Só artistas públicos têm link na página do evento.</p>
          )}
          {errors.lineup && <p className="mt-2 font-mono text-xs text-[var(--accent-text)]">[erro] {errors.lineup}</p>}
        </Panel>

        <Panel title="ingresso">
          <Checkbox label="Evento gratuito" name="is_free" checked={form.gratuito} onChange={(e) => set('gratuito', e.target.checked)} />
          {!form.gratuito && (
            <div className="mt-3">
              <Input label="Link de ingresso" name="ticket_url" type="url" inputMode="url" value={form.ingressoLink} onChange={(e) => set('ingressoLink', e.target.value)} placeholder="https://" error={errors.ticket_url} />
            </div>
          )}
        </Panel>

        {note && <p className="font-mono text-xs text-[var(--color-warn)]">{note}</p>}
        <Button type="submit" variant="solid" className="w-full" disabled={busy}>
          {submitLabel}
        </Button>
      </div>
    </Form>
  )
}
