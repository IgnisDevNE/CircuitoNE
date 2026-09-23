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

export interface ArtistProfile {
  id: string
  tipo: 'artista'
  nome: string // nome artístico / do projeto
  bio: string
  fotoApresentacao: string
  fotos: string[]
  estilos: string[]
  corPredominante: string // accent hex escolhido
  emailBooking?: string
  emailContato?: string
  presskit?: string
  mediaCache?: string
  cnpj?: string
  social: SocialLinks
}

export interface ServiceProfile {
  id: string
  tipo: 'servicos'
  nome: string
  tipoServico: 'estrutura' | 'som' | 'luzes' | 'performances' | 'outros'
  contato: string
  portfolio?: string
  social: SocialLinks
}

export interface AVProfile {
  id: string
  tipo: 'audiovisual'
  nome: string
  tipoServico: 'fotografia' | 'video' | 'audiovisual-completo' | 'som'
  contato: string
  portfolio?: string
  social: SocialLinks
}

export interface IntegranteProfile {
  id: string
  tipo: 'integrante'
  nome: string
  coletivoIds: string[]
  social: SocialLinks
}

export type Atuacao = ArtistProfile | ServiceProfile | AVProfile | IntegranteProfile

export interface User {
  id: string
  nome: string
  email: string
  genero: string
  nascimento: string
  cpf: string
  cidade: string
  estado: Estado
  social: SocialLinks
  atuacoes: Atuacao[]
}

export type NivelCargo = 0 | 1 | 2 // 0 membro, 1 comunicação, 2 admin

export interface Cargo {
  id: string
  nome: string
  nivel: NivelCargo
}

export interface Membro {
  userId: string
  nome: string
  cargoId: string
  lastSeen: string
  artistaId?: string // se tiver perfil de artista atrelado (clicável)
}

export interface SolicitacaoAcesso {
  id: string
  userId: string
  nome: string
  atuacaoDesejada: string // ex: "Artista", "Serviços"
  mensagem?: string
  data: string // rótulo relativo (ex: "há 2 dias")
  artistaId?: string // se o solicitante tem perfil de artista
}

export interface Collective {
  id: string
  nome: string
  tipo: 'coletivo' | 'produtora'
  atuacao: string[] // Eventos Musicais, Culturais, Serviços, Artistas
  bio: string
  imagem: string
  cidade: string
  estado: Estado
  cnpj?: string
  corPredominante: string
  social: SocialLinks
  cargos: Cargo[]
  membros: Membro[]
  solicitacoes?: SolicitacaoAcesso[]
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

export interface Message {
  id: string
  autorId: string
  autorNome: string
  texto: string
  timestamp: string
}

export interface Thread {
  id: string
  tipo: 'direta' | 'coletivo'
  titulo: string
  coletivoId?: string
  participantes: string[]
  mensagens: Message[]
  naoLidas: number
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
