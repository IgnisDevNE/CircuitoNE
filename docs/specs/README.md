# Especificações

Esta pasta reúne especificações de arquitetura, requisitos técnicos e infraestrutura que definem o comportamento ou a estrutura pretendida do projeto.

| Documento | Estado | Escopo |
|---|---|---|
| [Arquitetura do MVP](architecture-mvp.md) | Aprovado em 22/09/2026; implementação pendente | Stack, responsabilidades, segurança, hospedagem e critérios de implementação |
| [Ambientes e dados de teste](environments-and-test-data.md) | Requisitos aprovados em 22/09/2026; implementação pendente | Domínios prod/dev, separação de banco, login temporário, seeds e testes após migrações |

Cada especificação deve registrar estado, data, escopo, requisitos verificáveis e pendências. Usar nomes descritivos em `kebab-case`; criar novos arquivos quando houver um assunto próprio, sem pastas vazias ou documentos por tarefa sem necessidade. Atualizar este índice quando adicionar uma especificação.

- **Spec:** contrato técnico e resultado esperado. Aprovação do documento não significa implementação ou homologação concluída.
- **ADR:** contexto, alternativas e consequências de uma decisão relevante, em [decisions/](../decisions/). Não duplicar a especificação em um ADR.
- **Regras de negócio:** fonte canônica em [business-rules/mvp.md](../business-rules/mvp.md).
- **Execução e evidências:** tarefas no [plano](../planning/implementation-plan.md), revisões em [reviews/](../reviews/foundation-validation.md) e comandos verificados no [guia de ambiente](../engineering/environment.md).

Ao mudar um requisito aprovado, registrar a nova decisão e alinhar os documentos afetados. Detalhes ainda propostos ou pendentes devem continuar identificados como tais.
