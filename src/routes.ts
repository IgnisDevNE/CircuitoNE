import { type RouteConfig, layout, route } from '@react-router/dev/routes'

const paths = [
  '/',
  '/artistas',
  '/artistas/:id',
  '/entrar',
  '/cadastro',
  '/painel',
  '/painel/perfil/:atuacaoId',
  '/painel/dados',
  '/painel/dados/nova-atuacao',
  '/painel/seguranca',
  '/painel/mensagens',
  '/painel/coletivos',
  '/painel/explorar/artistas',
  '/painel/explorar/servicos',
  '/painel/explorar/audiovisual',
  '/painel/explorar/coletivos',
  '/coletivo/:id/painel',
  '/coletivo/:id/mensagens',
  '/coletivo/:id/solicitacoes',
  '/coletivo/:id/eventos/novo',
  '/coletivo/:id/membros',
  '/coletivo/:id/editar',
  '/coletivo/:id/perfil',
]

export default [
  ...paths.map((path, index) => route(path === '/' ? '' : path.slice(1), './routes/identity.tsx', { id: `page-${index}` })),
  // Páginas ligadas ao banco: um módulo por página, dentro de layouts. O restante ainda é o protótipo (identity -> legacy).
  layout('./routes/layouts/public.tsx', [
    route('eventos', './routes/events.tsx'),
    route('eventos/:id', './routes/event.tsx'),
    route('coletivos', './routes/collectives.tsx'),
    route('coletivos/:id', './routes/collective.tsx'),
  ]),
  route('sair', './routes/identity.tsx', { id: 'logout' }),
  route('*', './routes/not-found.tsx'),
] satisfies RouteConfig
