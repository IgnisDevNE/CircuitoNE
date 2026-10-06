import { useEffect, useState } from 'react'
import type { FieldErrors, FlowIntent, FlowResult } from '../../lib/registration-forms'
import { Button } from '../../components/ui/primitives'

const forIntents = (result: FlowResult | undefined, intents: FlowIntent[]) =>
  result && result.intent !== null && intents.includes(result.intent) ? result : undefined

/** Erros por campo da última resposta, restritos às intenções do formulário. */
export function errorsOf(result: FlowResult | undefined, ...intents: FlowIntent[]): FieldErrors {
  const own = forIntents(result, intents)
  return own && !own.ok ? own.errors : {}
}

/** Valor devolvido pelo servidor após um erro; senão, o valor inicial. */
export function valueOf(result: FlowResult | undefined, intent: FlowIntent, key: string, initial = ''): string {
  const own = forIntents(result, [intent])
  const value = own && !own.ok ? own.values?.[key] : undefined
  return typeof value === 'string' ? value : initial
}

export function valuesOf(result: FlowResult | undefined, intent: FlowIntent, key: string): string[] {
  const own = forIntents(result, [intent])
  const value = own && !own.ok ? own.values?.[key] : undefined
  return Array.isArray(value) ? value : []
}

/** Sucesso (só depois do servidor confirmar) ou erro geral do formulário. */
export function Feedback({ result, intents }: { result: FlowResult | undefined; intents: FlowIntent[] }) {
  const own = forIntents(result, intents)
  if (!own) return null
  if (own.ok)
    return (
      <p role="status" className="border border-[var(--color-ok)] px-3 py-2 font-mono text-sm text-[var(--color-ok)]">
        {own.message}
      </p>
    )
  return own.message ? (
    <p role="alert" className="border border-[var(--accent)] px-3 py-2 font-mono text-sm text-[var(--accent-text)]">
      {own.message}
    </p>
  ) : null
}

/** Falhas sem formulário associado (origem recusada, serviço indisponível). */
export function GeneralFeedback({ result }: { result: FlowResult | undefined }) {
  if (!result || result.ok || result.intent !== null || !result.message) return null
  return (
    <p role="alert" className="border border-[var(--accent)] px-3 py-2 font-mono text-sm text-[var(--accent-text)]">
      {result.message}
    </p>
  )
}

/**
 * Contagem regressiva para pedir outro envio, a partir do intervalo informado pela ação (ou pelo limite do Auth).
 * Só roda no navegador: sem JavaScript o botão fica ativo e o servidor aplica o limite.
 */
export function useCooldown(result: FlowResult | undefined) {
  const seconds = result?.cooldown ?? 0
  const [left, setLeft] = useState(0)
  useEffect(() => setLeft(seconds), [result, seconds])
  useEffect(() => {
    if (left <= 0) return
    const timer = setTimeout(() => setLeft((value) => value - 1), 1000)
    return () => clearTimeout(timer)
  }, [left])
  return left
}

export function ResendButton({ left, busy, label }: { left: number; busy?: boolean; label: string }) {
  return (
    <Button type="submit" variant="outline" disabled={busy || left > 0}>
      {left > 0 ? `${label} em ${left}s` : label}
    </Button>
  )
}
