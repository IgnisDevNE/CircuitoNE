import { ESTADOS, type ArtistaResumo, type Estado, type Evento } from '../../data/types'

export type ColetivoDestaque = {
  id: string
  nome: string
  tipo: 'coletivo' | 'produtora'
  cidade: string
  estado: Estado
}
export type HomeData = {
  proximos: Evento[]
  artistas: ArtistaResumo[]
  coletivos: ColetivoDestaque[]
  totais: { artistas: number; coletivos: number; eventos: number }
}

const invalid = () => new Error('Resposta inválida do banco de coletivos')
const UFS = ESTADOS.map((estado) => estado.value) as readonly string[]

/** Colunas de `collectives` liberadas ao visitante usadas na home (o RLS já limita a coletivos aprovados). */
export function mapCollectiveHighlights(rows: unknown): ColetivoDestaque[] {
  if (!Array.isArray(rows)) throw invalid()
  return rows.map((row: unknown) => {
    if (typeof row !== 'object' || row === null) throw invalid()
    const { id, name, kind, city, state_code: state } = row as Record<string, unknown>
    if (
      typeof id !== 'string' || !id ||
      typeof name !== 'string' || !name ||
      typeof city !== 'string' || !city ||
      typeof state !== 'string' || !UFS.includes(state) ||
      (kind !== 'collective' && kind !== 'producer')
    )
      throw invalid()
    return { id, nome: name, tipo: kind === 'producer' ? 'produtora' : 'coletivo', cidade: city, estado: state as Estado }
  })
}
