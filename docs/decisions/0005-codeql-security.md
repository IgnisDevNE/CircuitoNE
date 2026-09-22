# ADR 0005 — CodeQL para código e workflows

Data: 22/09/2026. Estado: configuração preparada; resultados e SHA registrados no PR de implantação.

O responsável solicitou adaptar o workflow do PR #48 como revisão automática de segurança. Analisar `javascript-typescript` (inclui React/TSX e scripts Node) e `actions` separadamente com `security-extended`, que mantém consultas padrão e acrescenta verificações de segurança. Não criar packs próprios, excluir código ou adicionar a suíte de qualidade nesta etapa.

Executar em PRs para `main`, pushes em `main`, toda quinta-feira às 04:30 UTC e por disparo manual. Usar runners descartáveis do GitHub, limite de 20 minutos por análise, cancelamento de execução anterior da mesma referência e categorias distintas por linguagem. Actions fixadas em SHA recebem atualizações pelo Dependabot já configurado.

`build-mode: none` dispensa instalação/build da aplicação. Checkout sem credencial persistida; somente `contents: read` e `security-events: write` no job. Sem secrets de ambiente, OIDC, runners próprios ou `pull_request_target`. O evento `pull_request` permite publicação de resultados de code scanning também para identidades restritas, como Dependabot; não ampliar permissões para contornar falhas. Publicar por Advanced Setup exige que Default Setup não esteja ativo; confirmar pelo upload real antes do merge.

Os resultados aparecem em Security → Code scanning e nos PRs. Um job concluído prova que o scanner executou, não que o produto esteja seguro. Não alterar proteções de branch incidentalmente: bloqueio automático por severidade depende de configuração nativa de code scanning pelo mantenedor, além da revisão humana já obrigatória. Achados P0/P1 continuam bloqueantes conforme [entrega](../engineering/delivery.md); qualquer achado adiado exige issue com evidência, responsável e aceite.

CodeQL complementa auditoria de dependências, testes e review OWASP Top 10 por fase. Não verifica sozinho RLS, regras de autorização, configuração Supabase, fluxos em runtime ou homologação. A [issue #31](https://github.com/IgnisDevNE/CircuitoNE/issues/31) continua bloqueando o aceite canônico e integrações dependentes; não bloqueia esta preparação de análise estática. Nenhuma regra de negócio ou banco foi alterado.

Referências: [configuração e proteção por severidade](https://docs.github.com/en/code-security/reference/code-scanning/workflow-configuration-options), [publicação em PRs do Dependabot](https://docs.github.com/en/code-security/reference/code-scanning/troubleshoot-analysis-errors/resource-not-accessible), [suítes de consultas](https://docs.github.com/en/code-security/concepts/code-scanning/codeql/codeql-query-suites).
