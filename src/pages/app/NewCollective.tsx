import { useState } from 'react'
import { Form, Link } from 'react-router'
import type { ActionResult } from '../../lib/action-result'
import { SOCIAL_FIELDS } from '../../lib/account-forms'
import { ACTIVITY_MAX, NAME_MAX } from '../../lib/collective-forms'
import { Button, Panel } from '../../components/ui/primitives'
import { Checkbox, Input, Textarea } from '../../components/ui/form'
import { LocationFields } from '../../components/ui/LocationFields'
import { SOCIAL_LABEL } from '../collective/EditCollectiveProfile'

export interface NewCollectiveProps {
  /** Identificador da solicitação, gerado ao carregar o formulário: reenviar o mesmo formulário não cria outro coletivo. */
  requestId: string
  /** Resultado da última tentativa; só existe depois de o banco responder. */
  feedback?: ActionResult | null
  busy?: boolean
}

const KINDS = [
  { value: 'collective', label: 'Coletivo', desc: 'Grupo de pessoas que organiza eventos, selos ou projetos; o CNPJ é opcional.' },
  { value: 'producer', label: 'Produtora', desc: 'Empresa de produção de eventos ou serviços; exige CNPJ.' },
] as const

const DEFAULT_COLOR = '#ff2040'

/** `/painel/coletivos/novo`: cadastra um coletivo ou uma produtora; ele nasce em análise e a conta vira a responsável. */
export function NewCollective({ requestId, feedback, busy = false }: NewCollectiveProps) {
  // Fixo enquanto o formulário estiver montado, mesmo que o loader rode de novo depois de uma recusa.
  const [request] = useState(requestId)
  const [kind, setKind] = useState<'collective' | 'producer' | ''>('')
  const failed = feedback && !feedback.ok ? feedback : null
  const errors = failed?.fields ?? {}
  const producer = kind === 'producer'
  return (
    <div className="max-w-3xl space-y-6">
      <h1 className="font-display text-2xl font-bold text-glow">$ novo_coletivo_produtora</h1>
      <p className="font-mono text-sm text-[var(--color-muted)]">
        Cadastre o coletivo ou a produtora que você representa. O cadastro passa por uma análise da administração do site; enquanto ela não termina,
        você pode corrigir os dados, mas as funções internas (eventos, membros, mensagens) só abrem depois da aprovação.
      </p>
      {failed && (
        <p role="alert" className="font-mono text-sm text-[var(--accent-text)]">
          [erro] {failed.error}
        </p>
      )}
      <Panel title="novo coletivo/produtora">
        <Form method="post" className="grid gap-4 sm:grid-cols-2" noValidate>
          <input type="hidden" name="request" value={request} />
          <fieldset className="sm:col-span-2" aria-describedby={errors.kind ? 'kind-erro' : undefined}>
            <legend className="mb-2 font-mono text-xs uppercase tracking-widest text-[var(--color-muted)]">
              <span aria-hidden className="text-[var(--accent-text)]">$ </span>Tipo
              <span className="text-[var(--accent-text)]"> *<span className="sr-only"> (obrigatório)</span></span>
            </legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {KINDS.map((item) => (
                <label
                  key={item.value}
                  className={`flex cursor-pointer items-start gap-3 border p-3 transition-colors ${kind === item.value ? 'border-[var(--accent)] bg-[color:color-mix(in_srgb,var(--accent)_12%,transparent)]' : 'border-[var(--color-line)] hover:border-[var(--color-muted)]'}`}
                >
                  <input
                    type="radio"
                    name="kind"
                    value={item.value}
                    checked={kind === item.value}
                    onChange={() => setKind(item.value)}
                    aria-invalid={!!errors.kind}
                    aria-describedby={errors.kind ? 'kind-erro' : undefined}
                    className="mt-1 accent-[var(--accent)]"
                  />
                  <span>
                    <span className="block font-mono text-sm">{item.label}</span>
                    <span className="mt-0.5 block text-xs text-[var(--color-muted)]">{item.desc}</span>
                  </span>
                </label>
              ))}
            </div>
            {errors.kind && <p id="kind-erro" className="mt-1 font-mono text-xs text-[var(--accent-text)]">[erro] {errors.kind}</p>}
          </fieldset>

          <div className="sm:col-span-2"><Input label="Nome" name="name" error={errors.name} maxLength={NAME_MAX} required /></div>
          <LocationFields ufName="state_code" cityName="city" ufError={errors.state_code} cityError={errors.city} />
          <div className="sm:col-span-2"><Input label="Área de atuação" name="activity" error={errors.activity} maxLength={ACTIVITY_MAX} required hint="ex: festas, selo, produção de eventos" /></div>
          <div className="sm:col-span-2"><Textarea label="Descrição" name="description" error={errors.description} rows={5} required /></div>
          <div className="sm:col-span-2">
            <Input
              label="CNPJ"
              name="cnpj"
              error={errors.cnpj}
              required={producer}
              inputMode="text"
              autoComplete="off"
              hint={producer ? 'obrigatório para produtoras' : 'opcional'}
            />
          </div>

          <fieldset className="sm:col-span-2">
            <legend className="mb-2 font-mono text-xs uppercase tracking-widest text-[var(--color-muted)]">
              <span aria-hidden className="text-[var(--accent-text)]">$ </span>Redes e cor (opcional)
            </legend>
            <div className="grid gap-4 sm:grid-cols-2">
              {SOCIAL_FIELDS.map((key) => (
                <Input
                  key={key}
                  label={SOCIAL_LABEL[key]}
                  name={key}
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
                  defaultValue={DEFAULT_COLOR}
                  aria-invalid={!!errors.color}
                  className="h-10 w-16 cursor-pointer border border-[var(--color-control)] bg-transparent"
                />
                <Checkbox name="use_color" label="usar esta cor no perfil" />
                {errors.color && <p className="font-mono text-xs text-[var(--accent-text)]">[erro] {errors.color}</p>}
              </div>
            </div>
          </fieldset>

          <div className="flex flex-wrap items-center gap-4 sm:col-span-2">
            <Button type="submit" variant="solid" disabled={busy}>{busy ? 'criando…' : 'criar'}</Button>
            <Link to="/painel/coletivos" className="font-mono text-sm text-[var(--color-muted)] underline">cancelar</Link>
          </div>
        </Form>
      </Panel>
    </div>
  )
}
