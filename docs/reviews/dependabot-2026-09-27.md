# Dependabot — 27/09/2026

A busca manual de atualizações produziu três PRs genuínas. Nenhuma atualização foi integrada neste checkpoint.

| PR | Parecer | Evidência e ação |
| --- | --- | --- |
| [#129](https://github.com/IgnisDevNE/CircuitoNE/pull/129) | Incompatível | React 19.3.0 com React DOM 19.2.7; quality/SSR recusou a combinação. Agrupar futuras atualizações do runtime e tipos React; a PR atual deve ser substituída por proposta consistente. |
| [#130](https://github.com/IgnisDevNE/CircuitoNE/pull/130) | Compatível tecnicamente, revisão humana pendente | Plugin React 6.1.1, testes/typecheck/build/CI/canônico/CodeQL verdes. Relatório, checks e comentário numérico Codecov recebidos no SHA exato; [evidência](evidence/codecov-dependabot-20260927.json). A aprovação desta evidência não integra a dependência automaticamente. |
| [#131](https://github.com/IgnisDevNE/CircuitoNE/pull/131) | Fora da toolchain aprovada | Tipos Node 26.6.2 com runtime Node 24.21.0. Manter atualizações 24.x; ignorar versões >=25 até decisão explícita de mudar o runtime. |

O agrupamento reduz propostas inconsistentes, mas não substitui o gate SSR que já recusou a #129. Nenhum downgrade artificial, segredo no CI candidato ou aumento de permissões foi necessário.

A #30 passa a seguir o destino e escopo atuais: Codecov próprio, publicador separado com token protegido, Dependabot sem esse token e forks somente com testes/LCOV. O teste do guard real comprova a política de fork; não é evidência de execução de uma PR externa real. Registro e encerramento da issue dependem da revisão/integração deste checkpoint.
