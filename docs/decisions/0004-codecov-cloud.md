# ADR 0004 — Codecov Cloud com identidade temporária

Data: 22/09/2026. Estado: integração Cloud implantada; destino pretendido substituído pela [ADR 0007](0007-codecov-self-hosted-target.md), com migração ainda pendente. Este registro descreve o workflow vigente até a troca validada na [issue #30](https://github.com/IgnisDevNE/CircuitoNE/issues/30).

O responsável instalou o App oficial do Codecov no repositório público e solicitou configurá-lo. [Codecov Cloud](https://app.codecov.io/gh/IgnisDevNE/CircuitoNE) foi escolhido e permanece como destino operacional do CI até a migração validada pela ADR 0007. A organização e CircuitoNE foram confirmados no painel autenticado. A investigação da instância própria era independente desta integração Cloud; seu bloqueio OAuth [#29](https://github.com/IgnisDevNE/CircuitoNE/issues/29) voltou a ser relevante para a migração. Nenhum serviço dessa instância foi removido ou reconfigurado nesta decisão.

Publicar LCOV somente após `quality` e `database` passarem, em outro runner, sem instalar ou executar código da aplicação. Um artefato separado da mesma execução contém somente LCOV; screenshots e relatórios Playwright não são entregues ao publicador. Checkout sem credencial persistida fornece metadados ao CLI. Action e CLI têm versões fixadas; manter verificação de integridade, desativar plugins, descoberta de arquivos e alterações automáticas do relatório.

Autenticar com OIDC do GitHub, permitido apenas no job de publicação; não criar `CODECOV_TOKEN` nem usar credencial da instância própria. Enviar explicitamente `github.sha`, o commit efetivamente testado, e o número do PR. Em PRs, esse SHA é o merge sintético; Codecov o trata como cobertura de merge, diferente do head da branch. Em `main`, o SHA corresponde ao commit integrado.

O upload atende `main`, disparos manuais e PRs internos. Forks preservam relatórios no CI, mas não publicam nesta etapa: a action muda para tokenless e há [falha aberta nesse caminho](https://github.com/codecov/codecov-action/issues/1972). Validar Dependabot real e reavaliar forks em F0-T13/[#30](https://github.com/IgnisDevNE/CircuitoNE/issues/30), sem fallback para secret estático.

Falha de upload deixa o job vermelho, preservando os artefatos. O novo job não é check obrigatório. Cobertura de projeto/patch é informativa, sem meta arbitrária; comentários automáticos ficam desligados. Essa evidência não substitui testes, homologação nem autoridade independente dos testes de aceite; [#31](https://github.com/IgnisDevNE/CircuitoNE/issues/31) permanece bloqueante nesses escopos. Nenhuma regra de negócio foi alterada.

Referências: [action/OIDC](https://github.com/codecov/codecov-action#using-oidc), [merge commits](https://docs.codecov.com/docs/merge-commits), [status informativo](https://docs.codecov.com/docs/commit-status#informational).
