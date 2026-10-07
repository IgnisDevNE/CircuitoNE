export type AtuacaoTipo = 'artista' | 'servicos' | 'audiovisual' | 'integrante'

export type Estado = typeof ESTADOS[number]['value']

export interface SocialLinks {
  instagram?: string
  soundcloud?: string
  bandcamp?: string
  facebook?: string
  youtube?: string
  site?: string
}

/** Par estilo/subestilo da taxonomia (`docs/specs/estilos-musicais.json`), com os rótulos canônicos do banco. */
export interface ArtistaEstilo {
  estilo: string
  subestilo?: string
}

/**
 * Artista público servido pelo banco (resumo para hub e home).
 * Cor e redes sociais só vêm de `get_profile` (as colunas liberadas ao visitante não as incluem),
 * então ficam fora do resumo; contato de booking, cachê e presskit nunca são públicos.
 */
export interface ArtistaResumo {
  id: string
  nome: string
  bio: string
  cidade: string
  estado: Estado
  estilos: ArtistaEstilo[]
  foto: string
}

/** Perfil público completo (`get_profile`). `fotos` fica vazia até os uploads (Storage, W11). */
export interface ArtistaPublico extends ArtistaResumo {
  corPredominante?: string
  fotos: string[]
  social: SocialLinks
}

export type EventoTipo =
  | 'festa'
  | 'festival'
  | 'evento-cultural'
  | 'feira'
  | 'encontro'
  | 'capacitacao'
  | 'outros'

export interface Evento {
  id: string
  nome: string
  tipo: EventoTipo
  tipoOutro?: string
  descricao: string // markdown
  inicio: string // ISO
  fim: string | null // ISO; ausente não implica horário fictício
  estado: Estado
  cidade: string
  local: string
  coletivoId: string
  lineup: { artistaId?: string; nome: string }[]
  ingressoLink?: string
  gratuito: boolean
  capa: string
}

export const ESTADOS = [
  { value: 'AC', label: 'Acre' },
  { value: 'AL', label: 'Alagoas' },
  { value: 'AP', label: 'Amapá' },
  { value: 'AM', label: 'Amazonas' },
  { value: 'BA', label: 'Bahia' },
  { value: 'CE', label: 'Ceará' },
  { value: 'DF', label: 'Distrito Federal' },
  { value: 'ES', label: 'Espírito Santo' },
  { value: 'GO', label: 'Goiás' },
  { value: 'MA', label: 'Maranhão' },
  { value: 'MT', label: 'Mato Grosso' },
  { value: 'MS', label: 'Mato Grosso do Sul' },
  { value: 'MG', label: 'Minas Gerais' },
  { value: 'PA', label: 'Pará' },
  { value: 'PB', label: 'Paraíba' },
  { value: 'PR', label: 'Paraná' },
  { value: 'PE', label: 'Pernambuco' },
  { value: 'PI', label: 'Piauí' },
  { value: 'RJ', label: 'Rio de Janeiro' },
  { value: 'RN', label: 'Rio Grande do Norte' },
  { value: 'RS', label: 'Rio Grande do Sul' },
  { value: 'RO', label: 'Rondônia' },
  { value: 'RR', label: 'Roraima' },
  { value: 'SC', label: 'Santa Catarina' },
  { value: 'SP', label: 'São Paulo' },
  { value: 'SE', label: 'Sergipe' },
  { value: 'TO', label: 'Tocantins' },
] as const

// Lista de estilos musicais do hub (parcial — para testes).
export const ESTILOS_MUSICAIS = ['Techno', 'House', 'Dub'] as const

export const TIPO_LABEL: Record<AtuacaoTipo, string> = {
  artista: 'Artista',
  servicos: 'Serviços',
  audiovisual: 'Audiovisual',
  integrante: 'Integrante de Coletivo',
}

export const EVENTO_TIPO_LABEL: Record<EventoTipo, string> = {
  festa: 'Festa',
  festival: 'Festival',
  'evento-cultural': 'Evento Cultural',
  feira: 'Feira',
  encontro: 'Encontro',
  capacitacao: 'Capacitação',
  outros: 'Outros',
}
