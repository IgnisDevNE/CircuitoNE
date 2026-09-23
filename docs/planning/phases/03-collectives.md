# Fase 3 — Coletivos, aprovação e autorização

**Estado:** planejada. **Entrada:** fases 1–2 aprovadas e registros revisados de D-01/D-09/RN-20/RN-21 integrados antes dos contratos correspondentes. As decisões foram aprovadas em 22/09/2026; isso não comprova implementação. **Risco principal:** elevação de privilégio entre coletivos. [Índice e gates comuns](../implementation-plan.md).

**Ordem:** T1 → T2 → T5 → T3/T4. Os IDs preservam a correspondência do backlog anterior, mas a aprovação operacional precisa existir antes de liberar gestão/diretório.

## F3-T1 — Criar coletivo/produtora pendente

**Bloqueios por issue:** [#40](https://github.com/IgnisDevNE/CircuitoNE/issues/40) na integração do registro revisado de estados/critérios operacionais e invariantes; [#20](https://github.com/IgnisDevNE/CircuitoNE/issues/20) para atuação do titular.

**Issues tratadas:** [#15](https://github.com/IgnisDevNE/CircuitoNE/issues/15) na criação persistida, [#12](https://github.com/IgnisDevNE/CircuitoNE/issues/12)/[#14](https://github.com/IgnisDevNE/CircuitoNE/issues/14) no estado pendente e ausência de privilégio imediato.

**Dependência:** F1-T2 e F2-T1. **Regras:** RN-15/16/30.

- Testar primeiro: criação repetida/concorrente, produtora sem CNPJ, CNPJ alfanumérico, falha no vínculo inicial e tentativa de o criador definir estado aprovado.
- Entrega: transação para dados públicos/privados, estado pendente, cargos e primeiro N2; tela de acompanhamento para o criador, com acesso distinto do dashboard interno.
- Aceite: coletivo pendente não aparece publicamente nem habilita dashboard, eventos, mensagens ou diretório, inclusive ao criador. Retomar o ramo de criação do onboarding somente com resultado persistido.
- Documentação: máquina de estados da solicitação, payload privado/público e recuperação/idempotência.

## F3-T2 — Vínculos, cargos e invariantes

**Bloqueios por issue:** [#40](https://github.com/IgnisDevNE/CircuitoNE/issues/40) na integração do registro revisado de RN-21, aprovada em 22/09/2026; parte de coletivo persistido de [#15](https://github.com/IgnisDevNE/CircuitoNE/issues/15) entregue em F3-T1.

**Issues tratadas:** [#12](https://github.com/IgnisDevNE/CircuitoNE/issues/12)/[#16](https://github.com/IgnisDevNE/CircuitoNE/issues/16) e parte de [#14](https://github.com/IgnisDevNE/CircuitoNE/issues/14) em vínculo, cargo e invariantes transacionais.

**Dependência:** F3-T1; contrato RN-21 revisado.

- Testar primeiro: N0/N1/N2, visitante, conta removida, N2 de outro coletivo, cargo de A atribuído em B, troca de proprietário e duas remoções/rebaixamentos simultâneos do último N2; transferência antes da saída/exclusão ou encerramento pelo suporte sem coletivo ativo órfão.
- Entrega: FKs compostas, grants/RLS, operações atômicas e validação de vínculo/cargo atual no banco. Conta criadora não é atalho permanente de autorização.
- Aceite: último N2 preservado também ao editar nível do cargo; saída/exclusão segue transferência concluída ou encerramento pelo suporte (RN-21), sem conservar conta indefinidamente por falta de sucessor. Não confiar em contagem sem trava. Funções privilegiadas têm justificativa, `search_path` fixo e `EXECUTE` restrito. Dados compartilhados após encerramento seguem #42/F6-T2, sem exclusão automática inferida.
- Documentação: matriz operação × ator, invariantes concorrentes e revisão de cada exceção a RLS.

## F3-T3 — Solicitar entrada e decidir

**Bloqueios por issue:** [#16](https://github.com/IgnisDevNE/CircuitoNE/issues/16) para invariantes; [#40](https://github.com/IgnisDevNE/CircuitoNE/issues/40) e parte de aprovação operacional de [#12](https://github.com/IgnisDevNE/CircuitoNE/issues/12)/[#14](https://github.com/IgnisDevNE/CircuitoNE/issues/14) verificada em F3-T5.

**Issues tratadas:** [#14](https://github.com/IgnisDevNE/CircuitoNE/issues/14)/[#15](https://github.com/IgnisDevNE/CircuitoNE/issues/15) na solicitação, decisão e vínculo N0 atômicos.

**Dependência:** F3-T2/T5 e registro revisado de RN-21 integrado.

- Testar primeiro: pedido duplicado, cancelamento, decisões simultâneas, retry, decisão em coletivo pendente e leitura de solicitações alheias.
- Entrega: solicitação, aprovação/recusa/retirada, vínculo N0 e histórico na mesma transação; retomar o ramo de ingresso do cadastro.
- Aceite: aprovação não escolhe o menor cargo disponível se ele tiver privilégio maior que N0; pedidos concluídos não viram membros duplicados; solicitante vê apenas seu estado/motivo permitido.
- Documentação: estados e transições, auditoria de decisão e contrato de visibilidade.

## F3-T4 — Gestão, perfil público e diretório restrito

**Bloqueios por issue:** [#16](https://github.com/IgnisDevNE/CircuitoNE/issues/16); [#40](https://github.com/IgnisDevNE/CircuitoNE/issues/40) na integração do registro revisado de diretório/revogação e perfil padrão; partes de autorização de [#12](https://github.com/IgnisDevNE/CircuitoNE/issues/12)/[#14](https://github.com/IgnisDevNE/CircuitoNE/issues/14) entregues em F3-T2/T5.

**Issues tratadas:** [#12](https://github.com/IgnisDevNE/CircuitoNE/issues/12)/[#15](https://github.com/IgnisDevNE/CircuitoNE/issues/15)/[#22](https://github.com/IgnisDevNE/CircuitoNE/issues/22)/[#26](https://github.com/IgnisDevNE/CircuitoNE/issues/26)/[#28](https://github.com/IgnisDevNE/CircuitoNE/issues/28) na gestão, perfil e diretório; fechar apenas critérios efetivamente concluídos.

**Dependência:** F3-T2/T5 e F2-T2. **Regras:** RN-07/18/20/22/30; D-09 e seleção de atuação pública de membro definidas.

- Testar primeiro: dados de todos os formulários persistem; HTML público só de aprovado; diretório negado a conta inativa, e-mail ou celular não confirmado, N0/N1, ex-membro e N2 apenas de coletivos pendentes/recusados/suspensos; N2 com outro vínculo aprovado continua elegível pelo vínculo válido; revogação é considerada sem esperar novo login. Testar link para o perfil padrão da conta em dois coletivos e ausência de link quando o padrão não existir ou deixar de ser público.
- Entrega: dashboard, cargos/membros, perfil SSR e diretório profissional paginado. Contexto de coletivo não mantém dados do anterior.
- Aceite: contatos, presskit, portfólio audiovisual, cachê e lista de serviços/equipamentos disponíveis apenas ao titular e N2 elegível conforme RN-07, respeitando os campos por tipo de RN-35; CPF/nascimento fora desse acesso. Coletivos/produtoras consultam materiais dos profissionais quando autorizados, mas não cadastram presskit, portfólio ou lista próprios. Perfil de membro aponta apenas para a atuação artística padrão da conta, escolhida pelo membro e atualmente pública (RN-20); público não recebe dados privados. Um vínculo elegível em outro coletivo preserva acesso ao diretório, sem restaurar poderes no coletivo suspenso.
- Documentação: projeções públicas/restritas, consultas/índices e controles de coleta abusiva de dados.

## F3-T5 — Administração do site e verificação

**Bloqueios por issue:** [#40](https://github.com/IgnisDevNE/CircuitoNE/issues/40) na integração do registro revisado de verificação/suspensão e contato operacional (RN-36); [#16](https://github.com/IgnisDevNE/CircuitoNE/issues/16) para integridade de cargos; [#23](https://github.com/IgnisDevNE/CircuitoNE/issues/23) para sessão segura.

**Issues tratadas:** [#12](https://github.com/IgnisDevNE/CircuitoNE/issues/12)/[#14](https://github.com/IgnisDevNE/CircuitoNE/issues/14) na aprovação operacional e ausência de autoaprovação.

**Dependência:** F3-T1/T2 e critérios de D-01/D-09 resolvidos.

- Testar primeiro: N2 não se promove a admin do site, não se autoaprova e não altera estado por REST; sessão sem MFA não decide; duas decisões concorrentes não corrompem estado; registro de verificação sem contato/comprovação suficientes não aprova; recusa permite corrigir/reapresentar sem liberar funções; contato operacional não vaza ao público ou ao diretório.
- Entrega: provisionamento inicial controlado, MFA, fila administrativa com descrição/referências, contato direto e registro restrito da análise manual rigorosa; aprovação/recusa motivada e reapresentação; suspensão motivada por fraude/falsidade/abuso e reativação somente pela administração. CNPJ não concede aprovação automática; não presumir KYC de todos os membros.
- Aceite: aprovado libera funções pela leitura do estado atual; pendente/recusado/suspenso permanece bloqueado. Suspensão oculta perfil e eventos públicos, incluindo busca, acesso direto e cache, preservando dados para revisão conforme RN-34/#42; impede gestão/envio de mensagens e elimina elegibilidade daquele vínculo no diretório, mantendo consulta somente ao histórico de mensagens para membros ainda autorizados, além do acompanhamento da decisão/suporte. Testar restauração autorizada após revisão administrativa. O papel operacional não herda leitura de CPF ou chats. Não implementar um nível 3 nos cargos de coletivo.
- Documentação: quem verifica, critérios e prazos operacionais, bootstrap/revogação de admin, transições e recuperação de decisão equivocada.

A fase 3 valida a política de suspensão e as superfícies existentes. Os efeitos integrados sobre eventos e mensagens devem ser repetidos em F4-T1/T3 e F5-T1/T2; não declarar fluxos ainda inexistentes como verificados nem fechar antecipadamente essas partes de #12/#14.

## Revisão e saída

Review normal por tarefa e review completo + OWASP em `docs/reviews/phase-3.md`, com dois coletivos e identidades distintas. Executar os testes contra REST/RPC/Storage, além da UI; verificar escalada vertical/horizontal, aprovação concorrente, último administrador e auditoria sem PII.

Ramos de criação/ingresso do onboarding passam a ter aceite integral nesta fase. Nenhuma dependência de desabilitar RLS para o frontend funcionar; homologação registra SHA e checksums das migrations.
