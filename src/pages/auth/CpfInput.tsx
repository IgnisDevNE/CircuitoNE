import { useState } from 'react'
import { Input } from '../../components/ui/form'
import { cpfError, formatCpf } from '../../lib/registration-validation'

/**
 * CPF com máscara `000.000.000-00` e validação imediata: o erro aparece assim que o 11º dígito é digitado (ou ao sair do
 * campo, se incompleto), antes do envio. O servidor e o banco continuam validando; o erro do servidor vale até o
 * valor ser editado.
 */
export function CpfInput({ defaultValue = '', serverError }: { defaultValue?: string; serverError?: string }) {
  const [value, setValue] = useState(() => formatCpf(defaultValue))
  const [touched, setTouched] = useState(false)
  const [edited, setEdited] = useState(false)
  const local = cpfError(value)
  const complete = value.replace(/\D/g, '').length === 11
  const error = local && (touched || complete) ? local : edited ? undefined : serverError
  return (
    <Input
      label="CPF"
      name="cpf"
      value={value}
      onChange={(event) => {
        setValue(formatCpf(event.target.value))
        setEdited(true)
      }}
      onBlur={() => setTouched(true)}
      error={error}
      inputMode="numeric"
      autoComplete="off"
      maxLength={14}
      placeholder="000.000.000-00"
      hint="não é público; não pode ser alterado depois"
      required
    />
  )
}
