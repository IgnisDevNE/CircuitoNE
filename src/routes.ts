import { type RouteConfig, route } from '@react-router/dev/routes'

const paths = [
  '/',
  '/artistas',
  '/artistas/:id',
  '/coletivos',
  '/coletivos/:id',
  '/eventos',
  '/eventos/:id',
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
  ...paths.map((path, index) => route(path === '/' ? '' : path.slice(1), './routes/legacy.tsx', { id: `page-${index}` })),
  route('*', './routes/not-found.tsx'),
] satisfies RouteConfig
