import type { ActionResult, FieldErrors, FormIntent } from '../../lib/account-forms'

/** Resultado da ação restrito às intenções de um formulário: erros por campo e valores devolvidos. */
const matches = (result: ActionResult | undefined, intents: FormIntent[]) =>
  !!result && result.intent !== null && intents.includes(result.intent)

export function errorsFor(result: ActionResult | undefined, ...intents: FormIntent[]): FieldErrors {
  return result && !result.ok && matches(result, intents) ? result.errors : {}
}

/** Valor devolvido pelo servidor após um erro de validação; senão, o valor salvo. */
export function valueFor(result: ActionResult | undefined, intent: FormIntent, key: string, saved: string): string {
  if (!result || result.ok || result.intent !== intent) return saved
  const value = result.values?.[key]
  return typeof value === 'string' ? value : saved
}

export function valuesFor(result: ActionResult | undefined, intent: FormIntent, key: string, saved: string[]): string[] {
  if (!result || result.ok || result.intent !== intent) return saved
  const value = result.values?.[key]
  return Array.isArray(value) ? value : saved
}

/** Sucesso (só depois de o servidor confirmar) ou erro geral de um formulário. */
export function FormFeedback({ result, intent }: { result: ActionResult | undefined; intent: FormIntent | FormIntent[] }) {
  const intents = Array.isArray(intent) ? intent : [intent]
  if (!result || !matches(result, intents)) return null
  if (result.ok)
    return (
      <p role="status" className="border border-[var(--color-ok)] px-3 py-2 font-mono text-sm text-[var(--color-ok)]">
        {result.message}
      </p>
    )
  return result.message ? (
    <p role="alert" className="border border-[var(--accent)] px-3 py-2 font-mono text-sm text-[var(--accent-text)]">
      {result.message}
    </p>
  ) : null
}

/** Falhas sem formulário associado (origem recusada, serviço indisponível, conta restrita). */
export function GeneralFeedback({ result }: { result: ActionResult | undefined }) {
  if (!result || result.ok || result.intent !== null || !result.message) return null
  return (
    <p role="alert" className="border border-[var(--accent)] px-3 py-2 font-mono text-sm text-[var(--accent-text)]">
      {result.message}
    </p>
  )
}
