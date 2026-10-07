import { useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react'
import { GENEROS } from '../../data/types'
import { cx } from '../../lib/utils'

const fieldBase =
  'w-full bg-[var(--color-bg-elev)] border border-[var(--color-line)] px-3 py-2 font-mono text-sm text-[var(--foreground)] placeholder:text-[var(--color-muted)] focus:border-[var(--accent)] outline-none transition-colors'

function Label({ htmlFor, children, required }: { htmlFor: string; children: ReactNode; required?: boolean }) {
  return (
    <label htmlFor={htmlFor} className="mb-1 block font-mono text-xs uppercase tracking-widest text-[var(--color-muted)]">
      <span aria-hidden className="text-[var(--accent-text)]">$ </span>
      {children}
      {required && (
        <span className="text-[var(--accent-text)]"> *<span className="sr-only"> (obrigatório)</span></span>
      )}
    </label>
  )
}

function Hint({ id, error, hint }: { id: string; error?: string; hint?: string }) {
  if (error) return <p id={id} className="mt-1 font-mono text-xs text-[var(--accent-text)]">[erro] {error}</p>
  if (hint) return <p id={id} className="mt-1 font-mono text-xs text-[var(--color-muted)]">{hint}</p>
  return null
}

type FieldWrap = { label: string; error?: string; hint?: string; required?: boolean }

export function Input({ label, error, hint, required, id, ...rest }: FieldWrap & InputHTMLAttributes<HTMLInputElement>) {
  const auto = useId()
  const fid = id ?? auto
  const dsc = `${fid}-desc`
  return (
    <div>
      <Label htmlFor={fid} required={required}>{label}</Label>
      <input
        id={fid}
        aria-invalid={!!error}
        aria-describedby={error || hint ? dsc : undefined}
        aria-required={required}
        className={cx(fieldBase, error && 'border-[var(--accent)]')}
        {...rest}
      />
      <Hint id={dsc} error={error} hint={hint} />
    </div>
  )
}

export function Textarea({ label, error, hint, required, id, ...rest }: FieldWrap & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const auto = useId()
  const fid = id ?? auto
  const dsc = `${fid}-desc`
  return (
    <div>
      <Label htmlFor={fid} required={required}>{label}</Label>
      <textarea
        id={fid}
        aria-invalid={!!error}
        aria-describedby={error || hint ? dsc : undefined}
        className={cx(fieldBase, 'min-h-24 resize-y', error && 'border-[var(--accent)]')}
        {...rest}
      />
      <Hint id={dsc} error={error} hint={hint} />
    </div>
  )
}

export function Select({
  label,
  error,
  hint,
  required,
  id,
  options,
  ...rest
}: FieldWrap & SelectHTMLAttributes<HTMLSelectElement> & { options: { value: string; label: string }[] }) {
  const auto = useId()
  const fid = id ?? auto
  const dsc = `${fid}-desc`
  return (
    <div>
      <Label htmlFor={fid} required={required}>{label}</Label>
      <select
        id={fid}
        aria-invalid={!!error}
        aria-describedby={error || hint ? dsc : undefined}
        className={cx(fieldBase, 'appearance-none', error && 'border-[var(--accent)]')}
        {...rest}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value} className="bg-[var(--color-bg-elev)]">
            {o.label}
          </option>
        ))}
      </select>
      <Hint id={dsc} error={error} hint={hint} />
    </div>
  )
}

/** Gênero (RN-04): opcional; a opção vazia é "prefiro não informar". Só os valores canônicos são enviados. */
export function GenderSelect({ defaultValue = '', error }: { defaultValue?: string; error?: string }) {
  return (
    <Select
      label="Gênero (opcional)"
      name="genero"
      defaultValue={defaultValue}
      error={error}
      options={[{ value: '', label: 'Prefiro não informar' }, ...GENEROS.map((genero) => ({ value: genero, label: genero }))]}
    />
  )
}

export function Checkbox({ label, id, ...rest }: { label: ReactNode } & InputHTMLAttributes<HTMLInputElement>) {
  const auto = useId()
  const fid = id ?? auto
  return (
    <label htmlFor={fid} className="flex cursor-pointer items-center gap-2 font-mono text-sm">
      <input id={fid} type="checkbox" className="accent-[var(--accent)]" {...rest} />
      {label}
    </label>
  )
}
