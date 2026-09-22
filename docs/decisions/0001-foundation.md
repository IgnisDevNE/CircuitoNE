# ADR 0001 — Backend e entrega do MVP

Data: 21/09/2026. Estado: **proposta técnica para revisão**; decisões de produto confirmadas estão em `docs/business-rules/mvp.md`.

**Atualização de 22/09/2026:** a [spec aprovada de arquitetura](../specs/architecture-mvp.md) substitui as propostas abaixo de SPA exclusiva, manutenção do roteador próprio e runtime exclusivamente estático. O destino passa a ser React Router Framework com SSR, Node e Caddy. Este documento preserva a proposta original; sua aprovação integral não deve ser presumida.

## Contexto

O protótipo usa React/Vite/Tailwind, roteador próprio e um StoreContext em memória. Há 27 rotas declaradas, nenhum SDK Supabase, nenhuma tabela/migração pública na homologação e nenhum teste de aplicação preexistente. Build e TypeScript passam. O investimento principal deve ser autorização, persistência e jornadas completas, preservando as telas úteis.

## Decisão proposta

- Manter SPA React/Vite. Supabase fornece Postgres, Auth, Storage e, na fase de mensagens, Realtime.
- CRUD simples via cliente Supabase com chave publicável e RLS. Transações de negócio por funções SQL/RPC específicas; Edge Functions somente para operações que exigem segredo, integração externa ou administração de Auth.
- Não criar servidor Express/Nest, microserviços, ORM, fila ou GraphQL no MVP. Reavaliar somente diante de necessidade demonstrada.
- Dados públicos, profissionais restritos e pessoais privados em objetos separados. Permissão no servidor, nunca apenas por menus.
- Manter testes rápidos locais e verificação de aceite sob autoridade diferente da implementação. A segurança depende também das credenciais e das regras do GitHub.
- `main` protegida; branches curtas `codex/…` partem de `main` atualizada. PR por tarefa. Homologação no projeto `CircuitoNE-dev` antes de produção. Uma revisão completa e OWASP por fase.
- Migrações canônicas em `docs/migrations/`, conforme AGENTS.md; adaptador temporário para a estrutura exigida pelo CLI descrito no README desse diretório. Nunca duas cópias editáveis.
- Não trocar o roteador apenas por preferência. Cobrir comportamento (parâmetros, voltar, links profundos, autorização, 404) e corrigir problemas reais; adotar biblioteca se o custo de correções justificar.
- Hospedagem escolhida: container estático no Podman deste Windows durante a preparação; posteriormente, o mesmo formato no Debian próprio. Caddy serve a SPA. Preview e produção permanecem separados; Supabase continua gerenciado. Nenhum deploy de produção nesta preparação.

## Consequências e limites

Menos serviços e duplicação de regras; maior importância de testes reais de RLS, constraints e transações. Funções privilegiadas são pequenas, têm autenticação/autorização explícita, `search_path` fixo e `EXECUTE` mínimo. Não resolver falha de acesso simplesmente adicionando `SECURITY DEFINER`.

O código do protótipo será organizado em uma fase curta antes da integração, com extração de validações e tratamento de Markdown. Não se propõe reescrita completa. Trocar mocks por chamadas assíncronas exige estados de carregamento, falha e concorrência que hoje não existem.

## Fontes verificadas

- [Supabase: segurança da API](https://supabase.com/docs/guides/api/securing-your-api) — grants e RLS são controles distintos.
- [Supabase: ambientes](https://supabase.com/docs/guides/deployment/managing-environments) — migrações e promoção entre ambientes.
- [GitHub: uso seguro de Actions](https://docs.github.com/en/actions/reference/security/secure-use) — privilégios mínimos e ações fixadas por SHA.
- [OWASP Top 10:2025](https://top10.owasp.org/2025/) — referência da revisão de segurança por fase.
