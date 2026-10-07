/**
 * Seleção de estilos musicais: valores `estilo` (principal) ou `estilo|subestilo`. Regra única do seletor e do servidor:
 * escolher um subestilo escolhe também o estilo principal dele; desmarcar o principal desmarca os subestilos.
 */

/** Estilo principal de um valor de subestilo (`techno|acid techno` → `techno`); `null` para um estilo principal. */
export const parentStyle = (value: string): string | null => (value.includes('|') ? value.slice(0, value.indexOf('|')) : null)

/** Acrescenta o estilo principal de cada subestilo escolhido (sem repetir), mantendo a ordem de entrada. */
export function withParentStyles(values: readonly string[]): string[] {
  const result = new Set(values)
  for (const value of values) {
    const parent = parentStyle(value)
    if (parent) result.add(parent)
  }
  return [...result]
}

/** Estado da seleção depois de marcar ou desmarcar `value`. */
export function toggleStyle(selected: readonly string[], value: string, checked: boolean): string[] {
  if (checked) return withParentStyles([...selected, value])
  const parent = parentStyle(value)
  return selected.filter((item) => item !== value && (parent !== null || parentStyle(item) !== value))
}
