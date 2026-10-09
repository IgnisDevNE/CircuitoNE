import { type RouteConfig, index, layout, route } from '@react-router/dev/routes'

export default [
  // Entrar e sair (Supabase Auth): fora dos layouts, com a própria sessão validada no servidor.
  route('entrar', './routes/login.tsx'),
  route('sair', './routes/logout.tsx'),
  // Cadastro real (e confirmação do link do e-mail): fora do layout autenticado, mas com SSR e a sessão validada no servidor.
  route('cadastro', './routes/registration.tsx'),
  route('auth/confirmar', './routes/auth-confirm.tsx'),
  // Documentos privados (presskit, lista de serviços): rota de recurso que valida a sessão e redireciona ao PDF assinado.
  route('painel/documentos/:atuacaoId/:tipo', './routes/document.tsx'),
  // Chat flutuante: rotas de recurso JSON (sem tela) que validam a sessão e a origem; ver server/chat.server.ts.
  route('api/chat/*', './routes/api/chat.tsx'),
  // Painel lateral do evento (abre sobre o painel em vez de navegar): detalhe público em JSON, sem tela.
  route('api/eventos/:id', './routes/api/event.tsx'),
  // Layout autenticado: valida a sessão no servidor e redireciona visitantes para /entrar.
  layout('./routes/layouts/app.tsx', [
    route('painel', './routes/dashboard.tsx'),
    route('painel/coletivos', './routes/my-collectives.tsx'),
    route('painel/dados', './routes/account-data.tsx'),
    route('painel/dados/nova-atuacao', './routes/new-profile.tsx'),
    route('painel/perfil/:atuacaoId', './routes/profile-edit.tsx'),
    route('painel/seguranca', './routes/security.tsx'),
    // "nova" (estática) vem antes de ":conversationId" e tem prioridade na correspondência.
    route('painel/mensagens/nova', './routes/message-new.tsx'),
    route('painel/mensagens/:conversationId?', './routes/messages.tsx'),
    // Catálogo interno (RN-06/RN-07): artistas, servicos, audiovisual e coletivos; outro valor responde 404 no loader.
    route('painel/explorar/:kind', './routes/explore.tsx'),
    // Área do coletivo: 404 para quem não é membro; menu e páginas conforme as permissões (get_collective_access).
    route('coletivo/:id', './routes/layouts/collective.tsx', [
      route('painel', './routes/collective-dashboard.tsx'),
      route('solicitacoes', './routes/collective-requests.tsx'),
      route('eventos/novo', './routes/event-create.tsx'),
      route('eventos/:eventId', './routes/event-manage.tsx'),
      route('mensagens/:conversationId?', './routes/collective-messages.tsx'),
      route('membros', './routes/collective-members.tsx'),
      route('editar', './routes/collective-edit.tsx'),
      route('perfil', './routes/collective-profile-edit.tsx'),
    ]),
  ]),
  // Páginas públicas: um módulo por página, todas lidas do banco como visitante.
  layout('./routes/layouts/public.tsx', [
    index('./routes/home.tsx'),
    route('artistas', './routes/artists.tsx'),
    route('artistas/:id', './routes/artist.tsx'),
    route('eventos', './routes/events.tsx'),
    route('eventos/:id', './routes/event.tsx'),
    route('coletivos', './routes/collectives.tsx'),
    route('coletivos/:id', './routes/collective.tsx'),
    route('manifesto', './routes/manifesto.tsx'),
  ]),
  route('*', './routes/not-found.tsx'),
] satisfies RouteConfig
