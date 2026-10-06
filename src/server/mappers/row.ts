/** Validation helpers shared by the database-to-UI mappers: a malformed row fails loudly instead of rendering partial data. */
export type Row = Record<string, unknown>

export const invalid = () => new Error('Resposta inválida do banco de dados')

export const isRow = (value: unknown): value is Row =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

export const text = (row: Row, key: string) => {
  const value = row[key]
  if (typeof value !== 'string' || !value) throw invalid()
  return value
}

export const optionalText = (row: Row, key: string) => {
  const value = row[key]
  if (value === null || value === undefined) return undefined
  if (typeof value !== 'string') throw invalid()
  return value || undefined
}

export const instant = (value: string) => {
  const time = Date.parse(value)
  if (Number.isNaN(time)) throw invalid()
  return new Date(time).toISOString()
}

export const webUrl = (value: string | undefined) =>
  value && URL.canParse(value) && ['http:', 'https:'].includes(new URL(value).protocol) ? value : undefined

export const oneOf = <T extends string>(value: string, allowed: readonly T[]): T => {
  if (!(allowed as readonly string[]).includes(value)) throw invalid()
  return value as T
}
