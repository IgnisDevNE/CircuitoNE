# ADR 0007 — Retorno ao Codecov próprio

Data: 22/09/2026. **Decisão aprovada; baseline própria validada em 23/09/2026; comentário de PR pendente.** Substitui o destino da [ADR 0004](0004-codecov-cloud.md).

O responsável voltou a escolher a instância própria em `pipeline.magalz.space`. O [commit de `main` e74153e](https://pipeline.magalz.space/github/IgnisDevNE/CircuitoNE/commit/e74153ef47e388959477e2c3410f9dfffe02503f) recebeu e processou LCOV com 43,13% de cobertura pelo publicador protegido. A substituição do upload Cloud só se conclui após verificar uma PR real e seu comentário.

Na migração, preservar o isolamento do publicador: ele recebe apenas o LCOV da execução aprovada, não executa a aplicação nem expõe credenciais a código de PR. Credenciais da instância própria ficam fora do App implementador e de artefatos/logs, conforme [#31](https://github.com/IgnisDevNE/CircuitoNE/issues/31). Confirmar o caminho de autenticação suportado pelo servidor antes de mudar o workflow; não presumir que o OIDC usado pelo Cloud funcionará na instância própria. Falhas de upload deixam evidência local no CI e não dispensam testes ou aceite canônico.

Verificar login/organização/repositório na instância própria ([#29](https://github.com/IgnisDevNE/CircuitoNE/issues/29)), então concluir servidor, upload e troca controlada no CI ([#30](https://github.com/IgnisDevNE/CircuitoNE/issues/30)). Os detalhes operacionais ficam no [diagnóstico](../reviews/codecov-diagnosis.md); esta decisão não autoriza alterar outros serviços do host.
