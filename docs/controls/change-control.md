# Controle de mudanças

Estado em 22/09/2026: **operacional com gates manuais e pendências na [#31](https://github.com/IgnisDevNE/CircuitoNE/issues/31)**. Aplica-se a código, testes, workflows, banco e infraestrutura do CircuitoNE. A [ADR 0006](../decisions/0006-canonical-ci-suite.md) define a decisão; a [spec de aceite](../specs/canonical-ci-suite.md) define o contrato técnico. Este documento registra quem autoriza cada mudança e o que a esteira já executa.

## Autoridade e registro

- O App implementador abre PRs no CircuitoNE e não tem acesso ao CircuitoNE-QA. O App QA publica o check `canonical-acceptance` e propõe testes, mas tem somente `Contents:read`; não pode alterar a suíte ativa. O workflow confiável do QA usa um `GITHUB_TOKEN` temporário com escrita apenas nos jobs que preparam/promovem a suíte ou limpam branches.
- `magalz` revisa mudanças na suíte e aprova PRs em SHA exato. A aprovação do autor da PR não substitui revisão independente. Mudanças no verificador ou nos workflows exigem PR revisada antes de entrar em `main` do QA; mudanças na suíte exigem proposta QA revisada antes da promoção a `accepted`. A proteção nativa de branches do QA privado ainda não está disponível no plano atual; esse gate é operacional, não uma garantia imposta pelo GitHub.
- Cada PR vincula tarefa/issue e registra: regra ou contrato afetado, SHA testado, testes novos e resultado vermelho/verde, revisão, check canônico, evidência de homologação quando aplicável e resultado pós-merge. Achado deferido, dívida ou bug fica em issue aberta conforme [entrega](../engineering/delivery.md).

## Fluxo atual

| Momento | Automático | Ação humana ainda necessária |
|---|---|---|
| PR de origem aberto ou atualizado | CI de qualidade e banco descartável; após sua conclusão, dispatch para QA. O QA recusa uma execução de origem inválida; quando elegível, fixa commit e suíte, executa Playwright no runner descartável contra a aplicação em container isolado e publica `canonical-acceptance` pelo App QA. | Revisar regra, código, testes e segurança; homologar a mudança no ambiente adequado. |
| PR altera `tests/e2e` | QA prepara/atualiza uma PR de proposta com os testes exatos. Até a aprovação, o aceite falha fechado. | Revisar e aprovar a PR QA no SHA atual; depois **reexecutar o CI da PR de origem** para obter novo aceite. A aprovação QA ainda não dispara essa reexecução automaticamente. |
| PR de origem pronta | Checks exigidos precisam estar verdes no SHA atual. | Aprovar e integrar a PR após revisão e homologação. O check não autoriza o próprio merge. |
| Merge em `main` | Novo CI e dispatch de promoção; QA reexecuta a suíte contra o commit integrado e avança `accepted` somente após conferir aprovação, check e conteúdo. Se falhar, a referência anterior permanece. | Conferir a promoção e tratar falhas antes de integrar trabalho dependente. Fechar a PR de proposta QA após confirmar a promoção; isso ainda não é automático. |
| PR QA fechada | O workflow `Clean closed QA branches` remove diariamente branches temporárias inalteradas e não reutilizadas; preserva `main` e `accepted`. | Nenhuma para a limpeza normal; investigar falha do workflow. |

Mudanças de schema vão primeiro ao banco descartável e à homologação `CircuitoNE-dev`, nunca diretamente à produção. O workflow atual de credenciais de homologação é manual e apenas de leitura: **não aplica migrations, não faz deploy e não prova homologação funcional**. Produção exige a evidência e aprovação descritas em [entrega](../engineering/delivery.md).

## Evidência inicial e limites

A [PR #57](https://github.com/IgnisDevNE/CircuitoNE/pull/57) passou pelo [CI integrado](https://github.com/IgnisDevNE/CircuitoNE/actions/runs/35790644526), pelo [dispatch corrigido](https://github.com/IgnisDevNE/CircuitoNE/actions/runs/35790840698) e pela [promoção QA](https://github.com/IgnisDevNE/CircuitoNE-QA/actions/runs/35790852960). `accepted` avançou para `dbc6cb5`, apontando para o commit integrado `36298fa` sem mudar a árvore dos testes. A [QA PR #7](https://github.com/IgnisDevNE/CircuitoNE-QA/pull/7) instalou a limpeza; a [primeira execução](https://github.com/IgnisDevNE/CircuitoNE-QA/actions/runs/35791623457) passou e deixou apenas `main` e `accepted` no remoto QA.

A [#31](https://github.com/IgnisDevNE/CircuitoNE/issues/31) ainda acompanha testes negativos, concorrência entre merge e promoção, proteção de branches do QA e retirada de credenciais humanas/chaves do ambiente implementador. Até esses controles serem concluídos, manter integração sequencial supervisionada e não declarar isolamento forte. Falha de promoção ou alteração de SHA exige nova validação; não contornar o check nem atualizar `accepted` manualmente para liberar uma PR.

A [#58](https://github.com/IgnisDevNE/CircuitoNE/issues/58) acompanha a automação da reexecução após aprovação da proposta QA e do fechamento dessa proposta após promoção. Até lá, seguir os dois passos manuais da tabela; eles não dispensam aprovação humana.
