# Plano do PoC

Atualizado em 06/10/2026. Objetivo: o dev (`circuitone-dev.magalz.space` → `CircuitoNE-dev`) com dados sintéticos e todas as telas ligadas ao banco real. Produção continua só com a página de espera.

Execução: um orquestrador especifica, revisa e integra cada tarefa; um implementador trabalha numa branch isolada. Cada tarefa termina com CI verde, merge, `db-dev.yml` (se houver migração), `deploy/dev.ps1` e smoke no navegador.

## Padrão de wiring (fixado na W1)

- `src/server/supabase.server.ts`: cliente Supabase por requisição (anônimo ou com cookies do usuário), sempre com a chave publicável e RLS. Loaders usam `supabaseLoader(request, client => loadX(client, ...))`, `unwrap()` (erro do PostgREST vira 503) e `HttpError(404|503)`; rotas exportam `headers = supabaseRouteHeaders` e um `ErrorBoundary` com `LoadError`.
- Funções `src/server/<domínio>.server.ts` recebem o cliente (testáveis com cliente fake); módulos de rota em `src/routes/` são finos.
- Uma rota por página em `src/routes.ts`, com `loader`/`action` próprios, dentro de rotas de layout (`PublicLayout`, `AppShell`, `CollectiveLayout`). Rotas ainda não ligadas continuam em `identity.tsx` → `LegacyRoute`.
- `src/server/mappers/*`: linhas do banco → tipos de UI existentes (`src/data/types.ts`). Atenção: na UI `estado` é a UF (`state_code`); no banco `state` é o ciclo de vida.
- Páginas ligadas usam `useLoaderData` e o `react-router` real em vez do shim `src/router.tsx`.
- Páginas públicas consultam como anônimo (`supabaseLoader(..., { anonymous: true })`). Páginas do painel ficam sob `src/routes/layouts/app.tsx` (sessão validada no servidor; `AppShell` real); páginas ainda não ligadas mostram "Em breve".
- Formulários pós-hidratação chegam como `<rota>.data` (single fetch); handlers devem normalizar o caminho.
- Ações de escrita usam `runMutation` (`src/server/mutation.server.ts`): só POST no caminho esperado, origem confiável (`APP_ORIGIN`), corpo limitado, cookies do titular, respostas privadas. O sucesso só existe depois do RPC; erros do banco passam pela tabela de mensagens conhecidas (nunca texto desconhecido). A rota exporta `headers = supabaseRouteHeaders` (repassa Set-Cookie da ação) e a página recebe `feedback` por props.
- Layouts aninhados: rota filha com loader dentro de layout que pode bloquear a página (ex.: coletivo não aprovado) exporta o próprio `ErrorBoundary`; sem `meta` na filha vale o do layout (que recebe `location`).
- Mudanças de estado nos testes e2e (`tests/e2e/db/`): usar a conta e os registros próprios da suíte (ex.: `fixture-applicant`, seed `collective-area.sql`) e restaurar via RPC (`tests/e2e/db/rpc.ts`); os projetos desktop e mobile rodam em paralelo, então testes que mudam dados ficam só no desktop.
- Escritas (W6): cada rota exporta `action = accountAction(request, handler)` (`src/server/account-settings.server.ts`): confere `APP_ORIGIN`/`sec-fetch-site` antes de qualquer acesso, limita o corpo (`boundedForm`), revalida a sessão no servidor (só conta ativa escreve) e responde `data(ActionResult)` privado, com os cookies de Auth renovados (`supabaseRouteHeaders` repassa `actionHeaders`). Validação manual em `src/lib/account-forms.ts` devolve erros por campo (as chaves são os `name` dos inputs) e os valores digitados; o banco continua a autoridade (RPCs `security definer` que recusam chaves desconhecidas e convertem violações de constraint em `22023` com mensagem própria). Sucesso só é mostrado depois do RPC/Auth responder sem erro. Os formulários funcionam sem JavaScript (POST na rota) e com ele (`<rota>.data`); ação que muda de página responde com `redirect`.
- Loaders de páginas restritas ao titular devolvem vazio (não 404) quando a conta não está ativa: o layout já mostra o aviso e o filho não pode competir com ele.
- e2e que escrevem dados (`tests/e2e/db/account.spec.ts`) rodam nos projetos `account-desktop` e `account-mobile`, que dependem dos demais e rodam um por vez; cada teste desfaz o que altera. Fixtures só podem ser mudadas por eles.
- Cadastro (W5): `/cadastro` (`registration.tsx`) fica fora do layout autenticado e retoma pela identidade real (`registrationStep`: sem sessão → conta; e-mail pendente; celular; código; dados), nunca por estado do cliente. `/auth/confirmar` é uma rota de recurso (`token_hash` + `type` ou `code`) que sempre redireciona; link vencido volta com `?confirmacao=invalida` e o reenvio (`auth.resend`). As ações usam `flowAction` (mesmas guardas de `runMutation`, mas servem a quem ainda não tem conta ativa) e o resultado `FlowResult`. O celular só se confirma por `updateUser({ phone })` + `verifyOtp({ type: 'phone_change' })` (o SMS sai pelo hook); o banco recusa celular duplicado e `complete_registration` exige e-mail e celular confirmados. Fora do runtime `development` a rota continua o protótipo (suíte preview).
- Testes: unidade para mappers/loaders (cliente fake); Playwright em `tests/e2e/db/` contra Supabase local com seeds (job `e2e` do CI, `pnpm test:e2e:db`); teste SQL para cada RPC nova.

## Tarefas

| # | Tarefa | Escopo | Fonte de dados | Issues | Status |
|---|---|---|---|---|---|
| 0 | Limpeza | Repo, GitHub, pod único, docs | — | — | ✅ #154 |
| D1 | Dataset de demonstração | `supabase/seeds/demo.sql`: 10 contas, 12 artistas, 5 coletivos, 16 eventos com datas reancoradas a cada `db-dev` | — | — | ✅ #155 |
| D2 | Ocultar fixtures no dev | `dev-hide-fixtures.sql`: fixtures despublicadas/suspensas/canceladas só no dev | — | — | ✅ #160 |
| W1 | Base + eventos públicos | Padrão acima; `/eventos`, `/eventos/:id`; e2e com Supabase local no CI | `list_events`, `get_event` | #18 #26 #28 | ✅ #156 |
| W2 | Coletivos públicos | `/coletivos`, `/coletivos/:id` | `collectives`, `get_collective_members`, `events` | #12 | ✅ #158 |
| W3 | Artistas públicos + Home | `/artistas`, `/artistas/:id`, `/` | `profiles`, `artist_styles`, `profile_images`, `get_profile`, `list_events(artist)` | #26 | ✅ #159 |
| W4 | Login das contas seed + painel | Senha das fixtures via seed (`FIXTURE_PASSWORD`); remover login demo; `AppShell` real; `/painel` | `get_account_session`, `list_conversations`; novas `list_my_profiles`, `list_my_collectives` | #14 #23 | ✅ #161 |
| W5 | Cadastro real (e-mail + SMS) | Spike: Send SMS Hook → Edge Function → AWS SNS; confirmação de e-mail; `/cadastro`, nova atuação | `complete_registration`, `create_profile` | #147 #15 #19 | — |
| W6 | Conta | `/painel/dados`, `/painel/perfil/:id`, `/painel/seguranca` (e-mail/senha, MFA TOTP, exclusão) | novas `get/update_account_details`, `update_profile`, `update_professional_details`; `request_account_deletion`, `delete_profile` | #15 #17 #20 #23 | — |
| W7 | Acesso a coletivo + solicitações | `CollectiveLayout` por permissões; `/coletivo/:id/painel`, `/solicitacoes`; `/painel/coletivos` | `get_collective_access`, `list_collective_events`, `get_collective_requests`, `decide_collective_request`, `get_my_collective_requests`, `request_collective_membership`, `cancel_collective_request` | #12 #22 | — |
| W8 | Eventos (escrita) | `/coletivo/:id/eventos/novo` e `/coletivo/:id/eventos/:eventId`: criar rascunho, editar, publicar, cancelar; capa por URL | `create_event`, `publish_event`, `update_event`, `cancel_event`, `get_event` | #18 | ✅ |
| W9 | Gestão de coletivo + Explorar | `/coletivo/:id/editar`, `/perfil`, `/membros`; `/painel/explorar/*` | `get_collective_status`, `edit_collective`, RPCs de cargos, `assign/remove_*`, `transfer_collective_ownership`; nova `get_collective_member_roster` | #16 | — |
| W10 | Mensagens | `/painel/mensagens`, `/coletivo/:id/mensagens`; Realtime opcional | `list_conversations`, `get_messages`, `send_message`, `mark_conversation_read`, `set_conversation_block`, `report_message` | #13 #25 | — |
| W11 | Uploads | Buckets e políticas de Storage; avatar, galeria, imagem de coletivo, capa, presskit | colunas `*_path` | #21 | — |
| W12 | Remover o protótipo | Apagar `mock.ts`, `StoreContext`, `App.tsx`/`legacy.tsx`, `router.tsx`, modo `preview`; acessibilidade e estados | — | #22 #24 #27 | — |

Dependências: W1 antes de todas; W2 e W3 em paralelo; W4 antes de W5–W10; W7 antes de W8 e W9; W11 e W12 por último.

## Fora do escopo do PoC

Lançamento em produção, backup próprio e criptografia de backup, host dedicado, disponibilidade do Supabase pago, auto-start do PC.
