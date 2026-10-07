import { useId, useState } from 'react'
import { ACCEPT, checkFileMeta, type UploadKind } from '../../lib/uploads'
import { cx } from '../../lib/utils'

/**
 * Campo de arquivo (`name="arquivo"`) com conferência antecipada de tipo e tamanho no navegador. É só conveniência:
 * o servidor repete a conferência e olha o conteúdo de verdade. Com JavaScript, um arquivo recusado bloqueia o envio
 * (validação nativa do formulário) e mostra o motivo; sem JavaScript, o servidor responde com a mesma mensagem.
 */
export function FileField({
  label,
  kind,
  error,
  hint,
  name = 'arquivo',
  required = true,
}: {
  label: string
  kind: UploadKind
  /** Erro devolvido pelo servidor para este campo. */
  error?: string
  hint?: string
  name?: string
  required?: boolean
}) {
  const id = useId()
  const [local, setLocal] = useState<string | null>(null)
  const message = local ?? error
  return (
    <div>
      <label htmlFor={id} className="mb-1 block font-mono text-xs uppercase tracking-widest text-[var(--color-muted)]">
        <span aria-hidden className="text-[var(--accent-text)]">$ </span>
        {label}
      </label>
      <input
        id={id}
        name={name}
        type="file"
        accept={ACCEPT[kind]}
        required={required}
        aria-invalid={!!message}
        aria-describedby={message || hint ? `${id}-desc` : undefined}
        onChange={(event) => {
          const file = event.currentTarget.files?.[0]
          const problem = file ? checkFileMeta(kind, file) : null
          event.currentTarget.setCustomValidity(problem ?? '')
          setLocal(problem)
        }}
        className={cx(
          'block w-full cursor-pointer border border-[var(--color-control)] bg-[var(--color-bg-elev)] px-3 py-2 font-mono text-sm text-[var(--foreground)] file:mr-3 file:cursor-pointer file:border-0 file:bg-transparent file:font-mono file:text-xs file:uppercase file:text-[var(--accent-text)]',
          message && 'border-[var(--accent)]',
        )}
      />
      {message ? (
        <p id={`${id}-desc`} role="alert" className="mt-1 font-mono text-xs text-[var(--accent-text)]">[erro] {message}</p>
      ) : hint ? (
        <p id={`${id}-desc`} className="mt-1 font-mono text-xs text-[var(--color-muted)]">{hint}</p>
      ) : null}
    </div>
  )
}
