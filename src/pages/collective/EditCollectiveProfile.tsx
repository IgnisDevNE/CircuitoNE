import { Form } from 'react-router'
import { Link } from '../../router'
import type { ActionResult } from '../../lib/action-result'
import { SOCIAL_FIELDS } from '../../lib/account-forms'
import type { ColetivoEdicao } from '../../server/mappers/collective-manage'
import { Button, Panel } from '../../components/ui/primitives'
import { Checkbox, Input, Textarea } from '../../components/ui/form'
import { AccentScope } from '../../components/ui/AccentScope'

export interface EditCollectiveProfileProps {
  coletivo: ColetivoEdicao
  /** Resultado da última operação; só existe depois de o banco responder. */
  feedback?: ActionResult | null
  busy?: boolean
}

const DEFAULT_COLOR = '#ff2040'
const SOCIAL_LABEL: Record<(typeof SOCIAL_FIELDS)[number], string> = {
  instagram: 'Instagram',
  bandcamp: 'Bandcamp',
  soundcloud: 'SoundCloud',
  facebook: 'Facebook',
  site: 'Site',
  youtube: 'YouTube',
}

/** `/coletivo/:id/perfil`: o que a página pública do coletivo mostra. A imagem de capa depende dos uploads (W11). */
export function EditCollectiveProfile({ coletivo, feedback, busy = false }: EditCollectiveProfileProps) {
  const failed = feedback && !feedback.ok ? feedback : null
  const errors = failed?.fields ?? {}
  return (
    <AccentScope color={coletivo.cor ?? DEFAULT_COLOR}>
      <Panel title="perfil público do coletivo">
        {feedback && (
          <p role={feedback.ok ? 'status' : 'alert'} className={`mb-4 font-mono text-sm ${feedback.ok ? 'text-[var(--color-ok)]' : 'text-[var(--accent-text)]'}`}>
            {feedback.ok ? feedback.message : `[erro] ${feedback.error}`}
          </p>
        )}
        {/* A versão na chave refaz o formulário com os dados do banco depois de salvar ou de um conflito de versão. */}
        <Form method="post" key={coletivo.versao} className="grid gap-4 sm:grid-cols-2" noValidate>
          <input type="hidden" name="version" value={coletivo.versao} />
          <div className="sm:col-span-2">
            <Textarea label="Descrição pública" name="description" defaultValue={coletivo.descricao} error={errors.description} rows={6} required />
          </div>
          {SOCIAL_FIELDS.map((key) => (
            <Input
              key={key}
              label={SOCIAL_LABEL[key]}
              name={key}
              defaultValue={coletivo.social[key] ?? ''}
              error={errors[key]}
              placeholder="https://"
              inputMode="url"
              autoComplete="off"
            />
          ))}
          <div className="space-y-2">
            <label htmlFor="color" className="block font-mono text-xs uppercase tracking-widest text-[var(--color-muted)]">
              <span aria-hidden className="text-[var(--accent-text)]">$ </span>cor predominante
            </label>
            <input
              id="color"
              name="color"
              type="color"
              defaultValue={coletivo.cor ?? DEFAULT_COLOR}
              aria-invalid={!!errors.color}
              className="h-10 w-16 cursor-pointer border border-[var(--color-line)] bg-transparent"
            />
            <Checkbox name="use_color" defaultChecked={coletivo.cor !== null} label="usar esta cor no perfil" />
            {errors.color && <p className="font-mono text-xs text-[var(--accent-text)]">[erro] {errors.color}</p>}
          </div>
          <p className="font-mono text-xs text-[var(--color-muted)] sm:col-span-2">
            A imagem de capa do coletivo será enviada por upload numa próxima etapa.
          </p>
          <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
            <Button type="submit" variant="solid" disabled={busy}>salvar</Button>
            <Link to={`/coletivos/${coletivo.id}`} className="inline-flex items-center font-mono text-sm text-[var(--accent-text)] hover:underline">ver perfil público ↗</Link>
            <span className="font-mono text-xs text-[var(--color-muted)]">versão {coletivo.versao}</span>
          </div>
        </Form>
      </Panel>
    </AccentScope>
  )
}
