import { Badge, PRESSED_BADGE } from './primitives'
import { UFS_NORDESTE, type Estado } from '../../data/types'

export interface UfFilterProps {
  /** UF escolhida; nulo mostra todas. */
  value: Estado | null
  onChange: (uf: Estado | null) => void
  label?: string
}

/** Fileira de botões para filtrar listas por UF: "todos" e uma UF do Nordeste por vez; tocar na UF escolhida limpa o filtro. */
export function UfFilter({ value, onChange, label = 'Filtrar por estado' }: UfFilterProps) {
  return (
    <div className="mb-6 flex flex-wrap gap-2" role="group" aria-label={label}>
      <button type="button" onClick={() => onChange(null)} className="cursor-pointer" aria-pressed={value === null}>
        <Badge tone={value === null ? 'accent' : 'neutral'} className={value === null ? PRESSED_BADGE : undefined}>todos</Badge>
      </button>
      {UFS_NORDESTE.map((uf) => (
        <button key={uf} type="button" onClick={() => onChange(uf === value ? null : uf)} className="cursor-pointer" aria-pressed={value === uf}>
          <Badge tone={value === uf ? 'accent' : 'neutral'} className={value === uf ? PRESSED_BADGE : undefined}>{uf}</Badge>
        </button>
      ))}
    </div>
  )
}
