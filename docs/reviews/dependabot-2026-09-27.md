# Dependabot — 27/09/2026

A busca manual produziu três PRs genuínas no checkpoint inicial. A #130 foi aprovada/atualizada e integrada depois; a #135 também foi integrada após revisão e promoção. Nenhum downgrade artificial foi usado como evidência.

| PR | Parecer | Evidência e ação |
| --- | --- | --- |
| [#129](https://github.com/IgnisDevNE/CircuitoNE/pull/129) | Incompatível, encerrada sem merge | React 19.3.0 com React DOM 19.2.7; quality/SSR recusou a combinação. Branch eliminada. Agrupar futuras atualizações do runtime e tipos React para gerar uma proposta consistente. |
| [#130](https://github.com/IgnisDevNE/CircuitoNE/pull/130) | Aprovada, integrada e promovida | Plugin React 6.1.1, testes/typecheck/build/CI/canônico/CodeQL verdes. Relatório, checks e comentário numérico Codecov recebidos no SHA exato; [evidência](evidence/codecov-dependabot-20260927.json). Após a negativa de merge com base avançada, foi atualizada/reaprovada em `8ed28a4`, integrada em `85611cd9bf98c3265d355f1aefcc6417be7d8e76` e promovida pelo QA 36300422243. |
| [#131](https://github.com/IgnisDevNE/CircuitoNE/pull/131) | Fora da toolchain aprovada, encerrada sem merge | Tipos Node 26.6.2 com runtime Node 24.21.0. Branch eliminada. Manter atualizações 24.x; ignorar versões >=25 até decisão explícita de mudar o runtime. |

O agrupamento reduz propostas inconsistentes, mas não substitui o gate SSR que já recusou a #129. Nenhum downgrade artificial, segredo no CI candidato ou aumento de permissões foi necessário.

A #30 passa a seguir o destino e escopo atuais: Codecov próprio, publicador separado com token protegido, Dependabot sem esse token e forks somente com testes/LCOV. O teste do guard real comprova a política de fork; não é evidência de execução de uma PR externa real. Registro/política integrados na #128; #30 encerrada com evidências. A #135 (oxfmt 0.70) foi aprovada em `0903e20`, integrada em `46bddaa27c640be01fe101026cdd0246cb990b1e`, com CI 36302553843 verde e accepted `8c8e932` apontando para esse SHA/run/PR. O ensaio em cópias CRLF foi idempotente, sem reformatação geral. A #134 segue pendente de CI/revisão no SHA atual; a execução 36302703247 falhou no timeout do subprocesso PowerShell, sem comprovar incompatibilidade React.
