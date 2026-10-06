import { type RouteConfig, index, layout, route } from '@react-router/dev/routes'

// Ainda pelo protótipo (identity -> legacy): entrar (login real no runtime development) e cadastro.
const paths = ['/entrar', '/cadastro']

// Páginas do painel ainda sem dados reais: mostram "Em breve" dentro do layout autenticado, uma por tarefa do plano.
const comingSoon = [
  '/painel/perfil/:atuacaoId',
  '/painel/dados',
  '/painel/dados/nova-atuacao',
  '/painel/seguranca',
  '/painel/mensagens',
  '/painel/explorar/artistas',
  '/painel/explorar/servicos',
  '/painel/explorar/audiovisual',
  '/painel/explorar/coletivos',
]

// Seções do coletivo ainda sem dados reais (W8–W10): "Em breve" dentro do layout do coletivo, com o menu por permissões.
const collectiveSoon = [
  'mensagens',
  'eventos/novo',
  'membros',
  'editar',
  'perfil',
]

export default [
  ...paths.map((path, position) => route(path.slice(1), './routes/identity.tsx', { id: `page-${position}` })),
  // Layout autenticado: valida a sessão no servidor e redireciona visitantes para /entrar.
  layout('./routes/layouts/app.tsx', [
    route('painel', './routes/dashboard.tsx'),
    route('painel/coletivos', './routes/my-collectives.tsx'),
    ...comingSoon.map((path, position) => route(path.slice(1), './routes/soon.tsx', { id: `soon-${position}` })),
    // Área do coletivo: 404 para quem não é membro; menu e páginas conforme as permissões (get_collective_access).
    route('coletivo/:id', './routes/layouts/collective.tsx', [
      route('painel', './routes/collective-dashboard.tsx'),
      route('solicitacoes', './routes/collective-requests.tsx'),
      ...collectiveSoon.map((path, position) => route(path, './routes/soon.tsx', { id: `collective-soon-${position}` })),
    ]),
  ]),
  // Páginas ligadas ao banco: um módulo por página, dentro de layouts. O restante ainda é o protótipo (identity -> legacy).
  layout('./routes/layouts/public.tsx', [
    index('./routes/home.tsx'),
    route('artistas', './routes/artists.tsx'),
    route('artistas/:id', './routes/artist.tsx'),
    route('eventos', './routes/events.tsx'),
    route('eventos/:id', './routes/event.tsx'),
    route('coletivos', './routes/collectives.tsx'),
    route('coletivos/:id', './routes/collective.tsx'),
  ]),
  route('sair', './routes/identity.tsx', { id: 'logout' }),
  route('*', './routes/not-found.tsx'),
] satisfies RouteConfig
