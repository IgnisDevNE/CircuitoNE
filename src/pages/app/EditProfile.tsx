import { useState, type ChangeEvent } from 'react'
import { Form, Link } from 'react-router'
import { TIPO_LABEL, type AtuacaoTipo } from '../../data/types'
import {
  AUDIOVISUAL_TYPES,
  CONFIRM_DELETE_PROFILE,
  encodeStyle,
  SERVICE_TYPES,
  SOCIAL_FIELDS,
  type ActionResult,
} from '../../lib/account-forms'
import { parentStyle, toggleStyle, withParentStyles } from '../../lib/style-selection'
import { formatCacheCents } from '../../lib/utils'
import type { PerfilEdicao, Profissional, Taxonomia } from '../../server/mappers/account-settings'
import { Badge, Button, Panel } from '../../components/ui/primitives'
import { Checkbox, Input, Select, Textarea } from '../../components/ui/form'
import { LocationFields } from '../../components/ui/LocationFields'
import { AccentScope } from '../../components/ui/AccentScope'
import { errorsFor, FormFeedback, GeneralFeedback, valueFor, valuesFor } from './account-ui'
import { DocumentPanel, PhotosPanel } from './ProfileFiles'

export interface EditProfileProps {
  perfil: PerfilEdicao
  /** Estilos e subestilos do banco; só usada por artistas. */
  taxonomia: Taxonomia
  result?: ActionResult
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

/**
 * Estilos musicais. Escolher um subestilo marca também o estilo principal dele; desmarcar o principal desmarca os
 * subestilos (`toggleStyle`). O servidor aplica a mesma regra a quem envia sem JavaScript.
 */
export function StylePicker({ taxonomia, selected, error }: { taxonomia: Taxonomia; selected: string[]; error?: string }) {
  const [values, setValues] = useState(() => withParentStyles(selected))
  const chosen = new Set(values)
  // Os subestilos de um estilo começam abertos só quando já há algum marcado; depois quem decide é a pessoa.
  const [opened] = useState(() => new Set(values.map(parentStyle).filter((style): style is string => style !== null)))
  const toggle = (value: string) => (event: ChangeEvent<HTMLInputElement>) => setValues(toggleStyle(values, value, event.target.checked))
  return (
    <fieldset className="sm:col-span-2" aria-describedby={error ? 'estilo-erro' : undefined}>
      <legend className="mb-2 font-mono text-xs uppercase tracking-widest text-[var(--color-muted)]">
        <span aria-hidden className="text-[var(--accent-text)]">$ </span>Estilos musicais
        <span className="text-[var(--accent-text)]"> *<span className="sr-only"> (escolha ao menos um)</span></span>
      </legend>
      <div className="grid max-h-96 gap-2 overflow-y-auto border border-[var(--color-line)] p-3 sm:grid-cols-2">
        {taxonomia.map(({ estilo, subestilos }) => (
          <div key={estilo} className="font-mono text-sm">
            <label className="flex cursor-pointer items-center gap-2">
              <input type="checkbox" name="estilo" value={estilo} checked={chosen.has(estilo)} onChange={toggle(estilo)} className="accent-[var(--accent)]" />
              {estilo}
            </label>
            {subestilos.length > 0 && (
              <details open={opened.has(estilo)} className="ml-6 mt-1">
                <summary className="cursor-pointer text-xs text-[var(--color-muted)]">subestilos de {estilo}</summary>
                <div className="mt-1 space-y-1">
                  {subestilos.map((sub) => {
                    const value = encodeStyle(estilo, sub)
                    return (
                      <label key={sub} className="flex cursor-pointer items-center gap-2 text-xs">
                        <input type="checkbox" name="estilo" value={value} checked={chosen.has(value)} onChange={toggle(value)} className="accent-[var(--accent)]" />
                        {sub}
                      </label>
                    )
                  })}
                </div>
              </details>
            )}
          </div>
        ))}
      </div>
      {error && <p id="estilo-erro" className="mt-1 font-mono text-xs text-[var(--accent-text)]">[erro] {error}</p>}
    </fieldset>
  )
}

function ProfessionalFields({ tipo, saved, result }: { tipo: AtuacaoTipo; saved: Profissional; result?: ActionResult }) {
  const errors = errorsFor(result, 'save-professional')
  const value = (key: string, current: string) => valueFor(result, 'save-professional', key, current)
  const cache = saved.cacheCentavos === null ? '' : formatCacheCents(saved.cacheCentavos)
  return (
    <>
      {tipo === 'artista' && (
        <>
          <Input label="E-mail de booking" name="emailBooking" type="email" defaultValue={value('emailBooking', saved.emailBooking ?? '')} error={errors.emailBooking} />
          <Input label="Média de cachê" name="cache" inputMode="decimal" placeholder="R$ 0,00" defaultValue={value('cache', cache)} error={errors.cache} hint="por apresentação, em reais" />
          <Input
            label="Presskit (URL)"
            name="presskit"
            type="url"
            placeholder="https://"
            defaultValue={value('presskit', saved.presskit ?? '')}
            error={errors.presskit}
            hint={saved.presskitPdfBytes !== null ? 'Há um PDF de presskit enviado: remova-o (painel abaixo) para usar um link.' : 'ou envie um PDF no painel abaixo'}
          />
        </>
      )}
      {tipo === 'servicos' && (
        <>
          <Select
            label="Tipo de serviço"
            name="tipoServico"
            defaultValue={value('tipoServico', saved.tipoServico ?? '')}
            error={errors.tipoServico}
            options={[{ value: '', label: 'Não informado' }, ...SERVICE_TYPES.map((option) => ({ value: option.value, label: option.label }))]}
          />
          <Input label="Qual serviço (se “Outros”)" name="servicoOutro" defaultValue={value('servicoOutro', saved.servicoOutro ?? '')} error={errors.servicoOutro} />
        </>
      )}
      {tipo === 'audiovisual' && (
        <>
          <Select
            label="Tipo de serviço"
            name="tipoAudiovisual"
            defaultValue={value('tipoAudiovisual', saved.tipoAudiovisual ?? '')}
            error={errors.tipoAudiovisual}
            options={[{ value: '', label: 'Não informado' }, ...AUDIOVISUAL_TYPES.map((option) => ({ value: option.value, label: option.label }))]}
          />
          <Input label="Portfólio (URL)" name="portfolio" type="url" placeholder="https://" defaultValue={value('portfolio', saved.portfolio ?? '')} error={errors.portfolio} />
        </>
      )}
      <Input label="E-mail de contato" name="emailContato" type="email" defaultValue={value('emailContato', saved.emailContato ?? '')} error={errors.emailContato} />
      <Input label="Telefone de contato" name="telefoneContato" type="tel" defaultValue={value('telefoneContato', saved.telefoneContato ?? '')} error={errors.telefoneContato} hint="com DDD, ex.: 81 99999-0000" />
      <Input label="CNPJ (facultativo)" name="cnpj" defaultValue={value('cnpj', saved.cnpj ?? '')} error={errors.cnpj} />
    </>
  )
}

export function EditProfile({ perfil, taxonomia, result, busy }: EditProfileProps) {
  const errors = errorsFor(result, 'save-profile')
  const value = (key: string, saved: string) => valueFor(result, 'save-profile', key, saved)
  const artist = perfil.tipo === 'artista'
  // Após um erro de validação, os campos voltam como o titular os enviou (inclusive caixas desmarcadas).
  const returned = result && !result.ok && result.intent === 'save-profile' ? result.values : undefined
  const colorOn = returned ? returned.usarCor === 'on' : perfil.cor !== null
  const published = returned ? returned.publicado === 'on' : perfil.publicado
  const selectedStyles = valuesFor(result, 'save-profile', 'estilo', perfil.estilos.map((s) => encodeStyle(s.estilo, s.subestilo)))
  const redes: Record<(typeof SOCIAL_FIELDS)[number], string> = {
    instagram: perfil.redes.instagram ?? '',
    bandcamp: perfil.redes.bandcamp ?? '',
    soundcloud: perfil.redes.soundcloud ?? '',
    facebook: perfil.redes.facebook ?? '',
    site: perfil.redes.site ?? '',
    youtube: perfil.redes.youtube ?? '',
  }
  const deleteErrors = errorsFor(result, 'delete-profile')

  return (
    <AccentScope color={perfil.cor ?? DEFAULT_COLOR}>
      <div className="max-w-3xl space-y-6">
        <header className="flex flex-wrap items-center gap-3">
          <h1 className="font-display text-2xl font-bold text-glow">$ editar_perfil · {perfil.nome}</h1>
          <Badge tone="accent">{TIPO_LABEL[perfil.tipo]}</Badge>
        </header>
        <GeneralFeedback result={result} />

        <Panel title={artist ? 'perfil de artista' : 'perfil'}>
          <Form method="post" className="grid gap-4 sm:grid-cols-2" noValidate>
            <input type="hidden" name="intent" value="save-profile" />
            <div className="sm:col-span-2">
              <Input label={artist ? 'Nome artístico' : 'Nome'} name="nome" defaultValue={value('nome', perfil.nome)} error={errors.nome} required />
            </div>
            <LocationFields
              ufName="estado"
              cityName="cidade"
              defaultUf={value('estado', perfil.estado)}
              defaultCity={value('cidade', perfil.cidade)}
              ufError={errors.estado}
              cityError={errors.cidade}
            />
            <div className="sm:col-span-2">
              <Textarea
                label={artist ? 'Bio' : 'Descrição'}
                name="descricao"
                rows={6}
                defaultValue={value('descricao', perfil.descricao)}
                error={errors.descricao}
                hint="aceita Markdown: **negrito**, _itálico_, listas e [links](https://…)"
              />
            </div>

            <fieldset className="sm:col-span-2">
              <legend className="mb-2 font-mono text-xs uppercase tracking-widest text-[var(--color-muted)]">
                <span aria-hidden className="text-[var(--accent-text)]">$ </span>Redes (endereço completo)
              </legend>
              <div className="grid gap-4 sm:grid-cols-2">
                {SOCIAL_FIELDS.map((key) => (
                  <Input key={key} label={SOCIAL_LABEL[key]} name={key} type="url" placeholder="https://" defaultValue={value(key, redes[key])} error={errors[key]} />
                ))}
              </div>
            </fieldset>

            <div className="space-y-2">
              <Checkbox label="Usar cor personalizada" name="usarCor" defaultChecked={colorOn} />
              <label htmlFor="cor" className="block font-mono text-xs uppercase tracking-widest text-[var(--color-muted)]">
                <span aria-hidden className="text-[var(--accent-text)]">$ </span>cor predominante
              </label>
              <input
                id="cor"
                name="cor"
                type="color"
                defaultValue={value('cor', perfil.cor ?? DEFAULT_COLOR)}
                aria-invalid={errors.cor ? true : undefined}
                aria-describedby={errors.cor ? 'cor-erro' : undefined}
                className="h-10 w-16 cursor-pointer border border-[var(--color-control)] bg-transparent"
              />
              {errors.cor && <p id="cor-erro" className="font-mono text-xs text-[var(--accent-text)]">[erro] {errors.cor}</p>}
            </div>

            {artist && (
              <>
                <div className="self-end">
                  <Checkbox label="Perfil público (visível a qualquer visitante)" name="publicado" defaultChecked={published} />
                </div>
                <StylePicker taxonomia={taxonomia} selected={selectedStyles} error={errors.estilo} />
              </>
            )}

            <div className="space-y-3 sm:col-span-2">
              <FormFeedback result={result} intent="save-profile" />
              <div className="flex flex-wrap items-center gap-3">
                <Button type="submit" variant="solid" disabled={busy}>{busy ? 'salvando…' : 'salvar perfil'}</Button>
                {artist && perfil.publicado && (
                  <Link to={`/artistas/${perfil.id}`} className="inline-flex items-center font-mono text-sm text-[var(--accent-text)] hover:underline">ver perfil público ↗</Link>
                )}
              </div>
            </div>
          </Form>
        </Panel>

        {artist && <PhotosPanel perfil={perfil} result={result} busy={busy} />}

        {perfil.profissional && (
          <Panel title="dados profissionais">
            <p className="mb-4 font-mono text-xs text-[var(--color-muted)]">
              Visíveis só para você e para proprietários de coletivos aprovados, com MFA.
            </p>
            <Form method="post" className="grid gap-4 sm:grid-cols-2" noValidate>
              <input type="hidden" name="intent" value="save-professional" />
              <ProfessionalFields tipo={perfil.tipo} saved={perfil.profissional} result={result} />
              <div className="space-y-3 sm:col-span-2">
                <FormFeedback result={result} intent="save-professional" />
                <Button type="submit" variant="solid" disabled={busy}>{busy ? 'salvando…' : 'salvar dados profissionais'}</Button>
              </div>
            </Form>
          </Panel>
        )}

        <DocumentPanel perfil={perfil} result={result} busy={busy} />

        <Panel title="excluir atuação">
          <p className="mb-4 text-sm text-[var(--color-muted)]">
            Excluir esta atuação remove o perfil, os estilos e os dados profissionais. Nos line-ups de eventos, só o nome creditado permanece, sem link. Conversas antigas passam a mostrar “Atuação excluída”. Não dá para desfazer.
          </p>
          <Form method="post" className="max-w-sm space-y-4" noValidate>
            <input type="hidden" name="intent" value="delete-profile" />
            <Input label={`Digite ${CONFIRM_DELETE_PROFILE} para confirmar`} name="confirmacao" autoComplete="off" error={deleteErrors.confirmacao} />
            <FormFeedback result={result} intent="delete-profile" />
            <Button type="submit" variant="danger" disabled={busy}>excluir atuação</Button>
          </Form>
        </Panel>
      </div>
    </AccentScope>
  )
}
