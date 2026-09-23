# ADR 0006 — Aceite canônico e promoção da suíte na esteira

Data: 22/09/2026. **Estado:** direção aprovada; check obrigatório e primeira promoção da suíte validados. O isolamento de credenciais da #31 / F0-T2 permanece pendente.

## Contexto

O responsável quer impedir que agentes ajustem os testes para fazer a própria implementação passar, poupando recursos do PC e concentrando o aceite no CI. A comparação de hashes detecta mudanças persistidas, mas não assegura execução quando o próprio PR controla comandos, runner, fixtures ou o resultado publicado. O diagnóstico do [PR #54](https://github.com/IgnisDevNE/CircuitoNE/pull/54) registra essas limitações; o diagnóstico não constitui aceite independente.

Na conversa, o responsável aprovou comparação com a suíte aceita e reexecução canônica no CI, acrescentando uma etapa que atualize a suíte com novos testes depois dos gates. A proposta anterior de VM local dedicada não é requisito deste mecanismo de aceite.

## Decisão

Adotar suíte e verificador versionados sob autoridade externa à implementação, executados em runners descartáveis do GitHub. O CI confere a integridade do conjunto protegido e testa o SHA candidato usando a origem aprovada dos testes, configuração, runner e dependências. O nome de um check e um resultado produzido pelo PR não estabelecem autoridade.

Novos testes têm revisão específica e versão fixada antes da implementação, sem substituir imediatamente a referência global. Depois de aprovação, merge e validação do commit integrado, um promotor separado publica automaticamente a versão exata aprovada. CI verde não autoriza novas expectativas nem remoções/relaxamentos silenciosos.

Usar Git e Actions, sem criar middleware ou framework próprio. O contrato de versões, concorrência, falhas e tarefas está na [spec de aceite canônico](../specs/canonical-ci-suite.md).

## Consequências e limites

- Reduzir processamento local de aceite; manter testes rápidos locais para TDD e diagnóstico.
- Separar aprovação de testes, execução do candidato e publicação/promoção. O implementador pode propor testes, mas não aprovar sua referência ou atestar a própria entrega.
- Invalidar aceite antes do merge quando a suíte/base avançar; coordenar a integração e a promoção anterior para impedir entrada com resultado desatualizado. Tratar promoção como operação auditável e condicionada ao estado atual, com retentativa e histórico; um merge não pode apagar testes aceitos por outro PR.
- O repositório QA, a suíte inicial, o App publicador e o check obrigatório com origem fixada foram preparados; a primeira promoção pós-merge foi validada nas PRs #56, #57 e #59. Esta decisão não dispensa homologação, revisão ou gates.
- Não alegar proteção contra credenciais administrativas disponíveis ao agente por outro caminho. O isolamento de credenciais permanece pendência da [#31](https://github.com/IgnisDevNE/CircuitoNE/issues/31); a escolha de CI não exige VM local nem encerra automaticamente essa issue.

## Alternativas consideradas

- **Somente hashes no workflow do PR:** insuficiente se o PR altera a referência/verificador ou executa outro comando.
- **Copiar os testes para a referência sempre que o CI ficar verde:** permitiria normalizar adulterações e perder alterações concorrentes; rejeitada.
- **VM local como primeiro passo obrigatório:** não escolhida para este fluxo, dado o objetivo de poupar recursos e deslocar execução para a esteira. Controles de credenciais precisam ser tratados pelo seu próprio requisito.
