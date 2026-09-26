# Especificações

Esta pasta reúne especificações de arquitetura, requisitos técnicos e infraestrutura que definem o comportamento ou a estrutura pretendida do projeto.

| Documento | Estado | Escopo |
|---|---|---|
| [Arquitetura do MVP](architecture-mvp.md) | Stack SSR/Node/Caddy implantada; integrações de produto pendentes | Stack, responsabilidades, segurança, hospedagem e critérios de implementação |
| [Ambientes e dados de teste](environments-and-test-data.md) | Domínios/SMTP/backup dev implantados; homologação e recuperação completas pendentes | Domínios prod/dev, separação de banco, Auth, seeds e testes após migrações |
| [Estilos musicais](music-styles.md) e [catálogo JSON](estilos-musicais.json) | Taxonomia aprovada em 23/09/2026; implementação pendente | Dois seletores por estilo, subestilo opcional, múltiplas escolhas e filtro |
| [Markdown da descrição de eventos](event-description-markdown.md) | Implementado e validado em F0-T7; conteúdo real depende dos gates de produto | Formatos, URLs, renderização segura e regressões |
| [Aceite canônico e promoção da suíte](canonical-ci-suite.md) | Gate obrigatório e promoção pós-merge operacionais; isolamento e ensaios finais pendentes na [#31](https://github.com/IgnisDevNE/CircuitoNE/issues/31) | Integridade, execução confiável no CI e atualização da referência após revisão, merge e validação |

Cada especificação deve registrar estado, data, escopo, requisitos verificáveis e pendências. Usar nomes descritivos em `kebab-case`; criar novos arquivos quando houver um assunto próprio, sem pastas vazias ou documentos por tarefa sem necessidade. Atualizar este índice quando adicionar uma especificação.

- **Spec:** contrato técnico e resultado esperado. Aprovação do documento não significa implementação ou homologação concluída.
- **ADR:** contexto, alternativas e consequências de uma decisão relevante, em [decisions/](../decisions/). Não duplicar a especificação em um ADR.
- **Regras de negócio:** fonte canônica em [business-rules/mvp.md](../business-rules/mvp.md).
- **Execução e evidências:** tarefas no [plano](../planning/implementation-plan.md), revisões em [reviews/](../reviews/foundation-validation.md) e comandos verificados no [guia de ambiente](../engineering/environment.md).

Ao mudar um requisito aprovado, registrar a nova decisão e alinhar os documentos afetados. Detalhes ainda propostos ou pendentes devem continuar identificados como tais.
