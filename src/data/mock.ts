import type { AVProfile, Collective, Evento, ServiceProfile, Thread, User } from './types'

// Unsplash photo helper (thematic: electronic music / rave / crowd / lights)
const img = (id: string, w = 800, h = 800) =>
  `https://images.unsplash.com/photo-${id}?w=${w}&h=${h}&fit=crop&auto=format`

// ---- Artistas (perfis públicos) ----
export const artistas = [
  {
    id: 'art-anerie',
    tipo: 'artista' as const,
    nome: 'ANERIE',
    bio: 'Produtora e DJ recifense navegando entre o techno hipnótico e batidas do maracatu eletrônico. Residente do coletivo Litoral Sul.',
    fotoApresentacao: img('1571266028243-e4733b0f0bb0', 900, 1100),
    fotos: [img('1493225457124-a3eb161ffa5f'), img('1516450360452-9312f5e86fc7'), img('1459749411175-04bf5292ceea')],
    estilos: ['Techno', 'Maracatu Eletrônico', 'Ambient'],
    corPredominante: '#8b5cf6',
    emailBooking: 'booking@anerie.art',
    emailContato: 'contato@anerie.art',
    presskit: 'https://anerie.art/presskit',
    mediaCache: 'R$ 2.500 – 4.000',
    social: { instagram: '@anerie.dj', soundcloud: 'anerie', bandcamp: 'anerie', site: 'anerie.art' },
  },
  {
    id: 'art-boitata',
    tipo: 'artista' as const,
    nome: 'BOITATÁ SYSTEM',
    bio: 'Sound system cearense de dub e bass music. Grave denso, cultura de rua, sistema de som próprio construído artesanalmente em Fortaleza.',
    fotoApresentacao: img('1470229722913-7c0e2dbbafd3', 900, 1100),
    fotos: [img('1533174072545-7a4b6ad7a6c3'), img('1524368535928-5b5e00ddc76b')],
    estilos: ['Dub', 'Bass Music', 'Dancehall'],
    corPredominante: '#22d3ee',
    emailBooking: 'contato@boitatasystem.com',
    mediaCache: 'R$ 3.000 – 6.000',
    social: { instagram: '@boitatasystem', soundcloud: 'boitata', youtube: 'boitatasystem' },
  },
  {
    id: 'art-jureno',
    tipo: 'artista' as const,
    nome: 'JURENÊ',
    bio: 'Live set modular potiguar. Sintetizadores analógicos, texturas do sertão e experimentação sonora vinda de Natal.',
    fotoApresentacao: img('1598488035139-bdbb2231ce04', 900, 1100),
    fotos: [img('1506157786151-b8491531f063'), img('1571019613454-1cb2f99b2d8b')],
    estilos: ['Live Modular', 'Experimental', 'IDM'],
    corPredominante: '#f59e0b',
    emailBooking: 'jurene@proton.me',
    mediaCache: 'R$ 1.800 – 3.200',
    social: { instagram: '@jurene.live', bandcamp: 'jurene', site: 'jurene.cc' },
  },
  {
    id: 'art-marimba',
    tipo: 'artista' as const,
    nome: 'MARIMBA DIGITAL',
    bio: 'Dupla baiana de house afro e batidas percussivas. Da diáspora ao clube, um som que celebra o corpo e o terreiro.',
    fotoApresentacao: img('1549213783-8284d0336c4f', 900, 1100),
    fotos: [img('1470225620780-dba8ba36b745'), img('1519892300165-cb5542fb47c7')],
    estilos: ['Afro House', 'Batida', 'Percussão'],
    corPredominante: '#ff2040',
    emailBooking: 'marimba@digital.art',
    mediaCache: 'R$ 4.000 – 7.500',
    social: { instagram: '@marimbadigital', soundcloud: 'marimbadigital', youtube: 'marimbadigital' },
  },
]

// ---- Coletivos / Produtoras ----
export const coletivos: Collective[] = [
  {
    id: 'col-litoral',
    nome: 'LITORAL SUL',
    tipo: 'coletivo',
    atuacao: ['Eventos Musicais', 'Artistas'],
    bio: 'Coletivo de Recife dedicado à cena techno independente do litoral pernambucano. Festas na praia, ocupação de espaços e formação de novos artistas.',
    imagem: img('1516450360452-9312f5e86fc7', 1200, 600),
    cidade: 'Recife',
    estado: 'PE',
    corPredominante: '#8b5cf6',
    social: { instagram: '@litoralsul.rec', soundcloud: 'litoralsul' },
    cargos: [
      { id: 'c-admin', nome: 'Administração', nivel: 2 },
      { id: 'c-com', nome: 'Comunicação', nivel: 1 },
      { id: 'c-membro', nome: 'Membro', nivel: 0 },
    ],
    membros: [
      { userId: 'u-demo', nome: 'Você (Demo)', cargoId: 'c-admin', lastSeen: 'agora', artistaId: 'art-anerie' },
      { userId: 'u-2', nome: 'Rafa Origem', cargoId: 'c-com', lastSeen: 'há 12 min' },
      { userId: 'u-3', nome: 'Kau Beats', cargoId: 'c-membro', lastSeen: 'há 2 h', artistaId: 'art-jureno' },
      { userId: 'u-4', nome: 'Duda Faro', cargoId: 'c-membro', lastSeen: 'ontem' },
    ],
    solicitacoes: [
      { id: 's-1', userId: 'u-9', nome: 'Lia Corrente', atuacaoDesejada: 'Artista', mensagem: 'Sou DJ de techno em Recife, quero somar nas festas do coletivo.', data: 'há 2 dias', artistaId: 'art-marimba' },
      { id: 's-2', userId: 'u-10', nome: 'Pedro Dantas', atuacaoDesejada: 'Serviços', mensagem: 'Ofereço estrutura de som e palco.', data: 'ontem' },
    ],
  },
  {
    id: 'col-usina',
    nome: 'USINA PRODUÇÕES',
    tipo: 'produtora',
    atuacao: ['Eventos Musicais', 'Eventos Culturais', 'Serviços'],
    bio: 'Produtora cearense de festivais e eventos culturais de grande porte. Estrutura completa, curadoria e logística para a cena eletrônica do Nordeste.',
    imagem: img('1459749411175-04bf5292ceea', 1200, 600),
    cidade: 'Fortaleza',
    estado: 'CE',
    cnpj: '41.222.333/0001-90',
    corPredominante: '#22d3ee',
    social: { instagram: '@usinaproducoes', site: 'usina.pro' },
    cargos: [
      { id: 'u-admin', nome: 'Diretoria', nivel: 2 },
      { id: 'u-prod', nome: 'Produção', nivel: 1 },
      { id: 'u-membro', nome: 'Colaborador', nivel: 0 },
    ],
    membros: [
      { userId: 'u-5', nome: 'Bel Sampaio', cargoId: 'u-admin', lastSeen: 'há 30 min' },
      { userId: 'u-demo', nome: 'Você (Demo)', cargoId: 'u-prod', lastSeen: 'agora' },
      { userId: 'u-6', nome: 'Ton Vasco', cargoId: 'u-membro', lastSeen: 'há 3 dias', artistaId: 'art-boitata' },
    ],
  },
]

// ---- Serviços (rede profissional — visível a admins de coletivo/produtora) ----
export const servicos: ServiceProfile[] = [
  { id: 'srv-nordeste', tipo: 'servicos', nome: 'Nordeste Estruturas', tipoServico: 'estrutura', contato: 'comercial@nordesteestruturas.com · (81) 99888-1122', portfolio: 'https://nordesteestruturas.com', social: { instagram: '@nordesteestruturas', site: 'nordesteestruturas.com' } },
  { id: 'srv-graves', tipo: 'servicos', nome: 'Graves do Sertão Som', tipoServico: 'som', contato: 'sistema@gravesdosertao.com · (85) 98777-3040', portfolio: 'https://gravesdosertao.com', social: { instagram: '@gravesdosertao' } },
  { id: 'srv-fulgor', tipo: 'servicos', nome: 'Fulgor Iluminação', tipoServico: 'luzes', contato: 'orcamento@fulgor.lux · (84) 99123-4567', social: { instagram: '@fulgor.lux' } },
]

// ---- Audiovisual (rede profissional) ----
export const audiovisuais: AVProfile[] = [
  { id: 'av-noturna', tipo: 'audiovisual', nome: 'Noturna Filmes', tipoServico: 'audiovisual-completo', contato: 'contato@noturnafilmes.com · (81) 99555-0090', portfolio: 'https://noturnafilmes.com/reel', social: { instagram: '@noturnafilmes', youtube: 'noturnafilmes' } },
  { id: 'av-flash', tipo: 'audiovisual', nome: 'Flash Litoral', tipoServico: 'fotografia', contato: 'ola@flashlitoral.com · (85) 98444-2211', portfolio: 'https://flashlitoral.com', social: { instagram: '@flashlitoral' } },
]

const now = Date.now()
const days = (n: number) => new Date(now + n * 86400000).toISOString()

// ---- Eventos ----
export const eventos: Evento[] = [
  {
    id: 'ev-porto',
    nome: 'PORTO NOTURNO — TECHNO NA ORLA',
    tipo: 'festa',
    descricao:
      '# Porto Noturno\n\nUma noite de **techno hipnótico** na orla de Recife. Line-up 100% nordestina, som em 360º e projeções ao vivo.\n\n- Abertura: 22h\n- Sunrise set incluso\n- *Traga protetor auricular*',
    inicio: days(6) + '',
    fim: days(7),
    estado: 'PE',
    cidade: 'Recife',
    local: 'Cais do Sertão',
    coletivoId: 'col-litoral',
    lineup: [
      { artistaId: 'art-anerie', nome: 'ANERIE' },
      { artistaId: 'art-jureno', nome: 'JURENÊ' },
      { nome: 'Convidada Surpresa' },
    ],
    gratuito: false,
    ingressoLink: 'https://ingressos.exemplo/porto-noturno',
    capa: img('1516450360452-9312f5e86fc7', 1600, 800),
  },
  {
    id: 'ev-usina-fest',
    nome: 'USINA FESTIVAL 2026',
    tipo: 'festival',
    descricao:
      '# Usina Festival\n\nTrês palcos, dois dias, uma celebração da **música eletrônica do Nordeste**. Arte, som e estrutura de nível internacional em Fortaleza.',
    inicio: days(21),
    fim: days(23),
    estado: 'CE',
    cidade: 'Fortaleza',
    local: 'Aterro da Praia de Iracema',
    coletivoId: 'col-usina',
    lineup: [
      { artistaId: 'art-boitata', nome: 'BOITATÁ SYSTEM' },
      { artistaId: 'art-marimba', nome: 'MARIMBA DIGITAL' },
      { artistaId: 'art-anerie', nome: 'ANERIE' },
    ],
    gratuito: false,
    ingressoLink: 'https://ingressos.exemplo/usina-2026',
    capa: img('1459749411175-04bf5292ceea', 1600, 800),
  },
  {
    id: 'ev-encontro',
    nome: 'ENCONTRO DE SOUND SYSTEMS',
    tipo: 'encontro',
    descricao:
      '# Encontro de Sound Systems\n\nTarde livre e **gratuita** de dub, bass e cultura de rua. Roda de conversa + som na praça.',
    inicio: days(12),
    fim: days(12.25),
    estado: 'CE',
    cidade: 'Fortaleza',
    local: 'Praça Verde do Dragão',
    coletivoId: 'col-usina',
    lineup: [{ artistaId: 'art-boitata', nome: 'BOITATÁ SYSTEM' }],
    gratuito: true,
    capa: img('1533174072545-7a4b6ad7a6c3', 1600, 800),
  },
  {
    id: 'ev-passado',
    nome: 'MARÉ BAIXA — EDIÇÃO INVERNO',
    tipo: 'festa',
    descricao: '# Maré Baixa\n\nEdição passada. Registro no nosso SoundCloud.',
    inicio: days(-20),
    fim: days(-19),
    estado: 'PE',
    cidade: 'Olinda',
    local: 'Sítio da Trindade',
    coletivoId: 'col-litoral',
    lineup: [{ artistaId: 'art-jureno', nome: 'JURENÊ' }],
    gratuito: false,
    capa: img('1493225457124-a3eb161ffa5f', 1600, 800),
  },
]

// ---- Usuário demo (logado) com múltiplas atuações ----
export const demoUser: User = {
  id: 'u-demo',
  nome: 'Ana Ribeiro',
  email: 'ana@cena.ne',
  genero: 'Mulher cis',
  nascimento: '1996-03-14',
  cpf: '123.456.789-00',
  cidade: 'Recife',
  estado: 'PE',
  social: { instagram: '@anaribeiro', soundcloud: 'anerie', site: 'anerie.art' },
  atuacoes: [
    artistas[0],
    {
      id: 'srv-ana',
      tipo: 'servicos',
      nome: 'Anerie Visuais',
      tipoServico: 'performances',
      contato: 'visuais@anerie.art',
      portfolio: 'https://anerie.art/vj',
      social: { instagram: '@anerie.vj' },
    },
    {
      id: 'int-ana',
      tipo: 'integrante',
      nome: 'Ana Ribeiro',
      coletivoIds: ['col-litoral', 'col-usina'],
      social: {},
    },
  ],
}

// ---- Threads de mensagens ----
export const threads: Thread[] = [
  {
    id: 'th-1',
    tipo: 'direta',
    titulo: 'Bel Sampaio · Usina',
    participantes: ['u-demo', 'u-5'],
    naoLidas: 2,
    mensagens: [
      { id: 'm1', autorId: 'u-5', autorNome: 'Bel Sampaio', texto: 'Oi Ana! Fechou o teu set no Usina Festival?', timestamp: days(-1) },
      { id: 'm2', autorId: 'u-demo', autorNome: 'Você', texto: 'Fechadíssimo. Mando o rider hoje.', timestamp: days(-1) },
      { id: 'm3', autorId: 'u-5', autorNome: 'Bel Sampaio', texto: 'Perfeito. Precisa de CDJ-3000?', timestamp: days(0) },
    ],
  },
  {
    id: 'th-2',
    tipo: 'coletivo',
    titulo: 'Litoral Sul · Geral',
    coletivoId: 'col-litoral',
    participantes: ['u-demo', 'u-2', 'u-3', 'u-4'],
    naoLidas: 0,
    mensagens: [
      { id: 'm4', autorId: 'u-2', autorNome: 'Rafa Origem', texto: 'Cartaz do Porto Noturno tá no drive, olhem!', timestamp: days(-2) },
      { id: 'm5', autorId: 'u-demo', autorNome: 'Você', texto: 'Ficou lindo demais 🔥', timestamp: days(-2) },
    ],
  },
  {
    id: 'th-3',
    tipo: 'coletivo',
    titulo: 'Usina · Produção',
    coletivoId: 'col-usina',
    participantes: ['u-demo', 'u-5', 'u-6'],
    naoLidas: 1,
    mensagens: [
      { id: 'm6', autorId: 'u-6', autorNome: 'Ton Vasco', texto: 'Estrutura de palco confirmada pra sexta.', timestamp: days(-1) },
    ],
  },
]
