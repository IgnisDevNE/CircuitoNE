import { useState } from 'react'
import { PROFILE_KINDS, type FieldErrors } from '../../lib/registration-forms'
import type { AtuacaoTipo } from '../../data/types'
import type { Taxonomia } from '../../server/mappers/account-settings'
import { Input } from '../../components/ui/form'
import { StylePicker } from '../app/EditProfile'

/**
 * Tipo, nome e (artistas) estilos da atuação: usados na primeira atuação do cadastro e em "nova atuação".
 * Cidade e estado da atuação vêm da conta (o banco os copia).
 */
export function ProfileFields({
  taxonomia,
  errors,
  tipo,
  nome,
  estilos,
  memberHint,
}: {
  taxonomia: Taxonomia
  errors: FieldErrors
  tipo: string
  nome: string
  estilos: string[]
  /** Sugestão de nome para integrante de coletivo (o nome da própria pessoa). */
  memberHint?: string
}) {
  const [kind, setKind] = useState<AtuacaoTipo | ''>(PROFILE_KINDS.find((item) => item.value === tipo)?.value ?? '')
  return (
    <div className="space-y-4">
      <fieldset aria-describedby={errors.tipo ? 'tipo-erro' : undefined}>
        <legend className="mb-2 font-mono text-xs uppercase tracking-widest text-[var(--color-muted)]">
          <span aria-hidden className="text-[var(--accent-text)]">$ </span>Tipo de atuação
          <span className="text-[var(--accent-text)]"> *<span className="sr-only"> (obrigatório)</span></span>
        </legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {PROFILE_KINDS.map((item) => (
            <label
              key={item.value}
              className={`flex cursor-pointer items-start gap-3 border p-3 transition-colors ${kind === item.value ? 'border-[var(--accent)] bg-[color:color-mix(in_srgb,var(--accent)_12%,transparent)]' : 'border-[var(--color-line)] hover:border-[var(--color-muted)]'}`}
            >
              <input
                type="radio"
                name="tipo"
                value={item.value}
                checked={kind === item.value}
                onChange={() => setKind(item.value)}
                aria-invalid={!!errors.tipo}
                className="mt-1 accent-[var(--accent)]"
              />
              <span>
                <span className="block font-mono text-sm">{item.label}</span>
                <span className="mt-0.5 block text-xs text-[var(--color-muted)]">{item.desc}</span>
              </span>
            </label>
          ))}
        </div>
        {errors.tipo && <p id="tipo-erro" className="mt-1 font-mono text-xs text-[var(--accent-text)]">[erro] {errors.tipo}</p>}
      </fieldset>
      <Input
        label="Nome da atuação"
        name="atuacaoNome"
        defaultValue={nome}
        error={errors.atuacaoNome}
        maxLength={200}
        required={kind !== 'integrante'}
        hint={kind === 'artista' ? 'nome artístico ou do projeto; cada projeto pode ter um perfil próprio' : kind === 'integrante' ? `deixe em branco para usar ${memberHint ? `"${memberHint}"` : 'o seu nome'}` : undefined}
      />
      {kind === 'artista' && <StylePicker taxonomia={taxonomia} selected={estilos} error={errors.estilo} />}
    </div>
  )
}
