import { useId, useState, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react'
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

/** Accessible radio-card group. */
export function RadioCards<T extends string>({
  legend,
  value,
  onChange,
  options,
  required,
  error,
}: {
  legend: string
  value: T | ''
  onChange: (v: T) => void
  options: { value: T; label: string; desc?: string }[]
  required?: boolean
  error?: string
}) {
  const errorId = useId()
  return (
    <fieldset aria-describedby={error ? errorId : undefined}>
      <legend className="mb-2 font-mono text-xs uppercase tracking-widest text-[var(--color-muted)]">
        <span aria-hidden className="text-[var(--accent-text)]">$ </span>
        {legend}
        {required && <span className="text-[var(--accent-text)]"> *</span>}
      </legend>
      <div className="grid gap-2 sm:grid-cols-2">
        {options.map((o) => {
          const active = value === o.value
          return (
            <label
              key={o.value}
              className={cx(
                'flex cursor-pointer items-start gap-3 border p-3 transition-colors',
                active ? 'border-[var(--accent)] bg-[color:color-mix(in_srgb,var(--accent)_12%,transparent)]' : 'border-[var(--color-line)] hover:border-[var(--color-muted)]',
              )}
            >
              <input
                type="radio"
                name={legend}
                aria-invalid={!!error}
                aria-describedby={error ? errorId : undefined}
                value={o.value}
                checked={active}
                onChange={() => onChange(o.value)}
                className="mt-1 accent-[var(--accent)]"
              />
              <span>
                <span className="block font-mono text-sm text-[var(--foreground)]">{o.label}</span>
                {o.desc && <span className="mt-0.5 block text-xs text-[var(--color-muted)]">{o.desc}</span>}
              </span>
            </label>
          )
        })}
      </div>
      {error && <p id={errorId} className="mt-1 font-mono text-xs text-[var(--accent-text)]">[erro] {error}</p>}
    </fieldset>
  )
}

/** Campo de imagem: URL ou upload de arquivo (data URL). WCAG: rádios rotulados + preview com alt. */
export function ImageField({
  label,
  value,
  onChange,
  hint,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  hint?: string
}) {
  const auto = useId()
  const [modo, setModo] = useState<'url' | 'upload'>(value.startsWith('data:') ? 'upload' : 'url')

  const onFile = (file?: File) => {
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => onChange(String(reader.result))
    reader.readAsDataURL(file)
  }

  return (
    <fieldset>
      <legend className="mb-1 font-mono text-xs uppercase tracking-widest text-[var(--color-muted)]">
        <span aria-hidden className="text-[var(--accent-text)]">$ </span>{label}
      </legend>
      <div className="mb-2 flex gap-4 font-mono text-xs">
        {(['url', 'upload'] as const).map((m) => (
          <label key={m} className="flex cursor-pointer items-center gap-1.5">
            <input type="radio" name={`img-${auto}`} checked={modo === m} onChange={() => setModo(m)} className="accent-[var(--accent)]" />
            {m === 'url' ? 'URL' : 'Upload'}
          </label>
        ))}
      </div>
      {modo === 'url' ? (
        <input
          id={`${auto}-url`}
          aria-label={`${label} — URL`}
          value={value.startsWith('data:') ? '' : value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="https://"
          className={fieldBase}
        />
      ) : (
        <input
          id={`${auto}-file`}
          aria-label={`${label} — arquivo`}
          type="file"
          accept="image/*"
          onChange={(e) => onFile(e.target.files?.[0])}
          className="w-full font-mono text-xs text-[var(--color-muted)] file:mr-3 file:border file:border-[var(--color-line)] file:bg-[var(--color-bg-elev)] file:px-3 file:py-1.5 file:font-mono file:text-xs file:text-[var(--foreground)] hover:file:border-[var(--accent)]"
        />
      )}
      {value && (
        <img src={value} alt={`Prévia: ${label}`} className="mt-2 h-24 w-full border border-[var(--color-line)] object-cover" />
      )}
      {hint && <p className="mt-1 font-mono text-xs text-[var(--color-muted)]">{hint}</p>}
    </fieldset>
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
