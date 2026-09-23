# Fase 3 — Coletivos, aprovação e autorização

**Estado:** planejada. **Entrada:** fases 1–2 aprovadas e registros revisados de D-01/D-09/RN-20/RN-21 e [#66](https://github.com/IgnisDevNE/CircuitoNE/issues/66) integrados antes dos contratos correspondentes. O catálogo e o perfil Membro foram aprovados em 23/09/2026; implementação e homologação ainda faltam. **Risco principal:** elevação de privilégio entre coletivos. [Índice e gates comuns](../implementation-plan.md).

**Ordem:** T1 → T2 → T5 → T3/T4. Os IDs preservam a correspondência do backlog anterior, mas a aprovação operacional precisa existir antes de liberar gestão/diretório.

## F3-T1 — Criar coletivo/produtora pendente

**Bloqueios por issue:** [#40](https://github.com/IgnisDevNE/CircuitoNE/issues/40) na integração dos estados/critérios operacionais; [#66](https://github.com/IgnisDevNE/CircuitoNE/issues/66) para propriedade única e perfil inicial; [#20](https://github.com/IgnisDevNE/CircuitoNE/issues/20) para atuação do titular.

**Issues tratadas:** [#15](https://github.com/IgnisDevNE/CircuitoNE/issues/15) na criação persistida, [#12](https://github.com/IgnisDevNE/CircuitoNE/issues/12)/[#14](https://github.com/IgnisDevNE/CircuitoNE/issues/14) no estado pendente e ausência de privilégio imediato.

**Dependência:** F1-T2 e F2-T1. **Regras:** RN-15/16/30.

- Testar primeiro: criação repetida/concorrente, produtora sem CNPJ, CNPJ alfanumérico, falha no vínculo inicial e tentativa de o criador definir estado aprovado.
- Entrega: transação para dados públicos/privados, estado pendente, perfil inicial e proprietário criador; tela de acompanhamento para o criador, com acesso distinto do dashboard interno.
- Aceite: coletivo pendente não aparece publicamente nem habilita dashboard, eventos, mensagens ou diretório, inclusive ao criador. Retomar o ramo de criação do onboarding somente com resultado persistido.
- Documentação: máquina de estados da solicitação, payload privado/público e recuperação/idempotência.

## F3-T2 — Vínculos, perfis de acesso e invariantes

**Bloqueios por issue:** [#40](https://github.com/IgnisDevNE/CircuitoNE/issues/40) como histórico da invariante sem coletivo órfão; [#66](https://github.com/IgnisDevNE/CircuitoNE/issues/66) na propriedade única, transferência e catálogo/atribuição/revogação de perfis; parte de coletivo persistido de [#15](https://github.com/IgnisDevNE/CircuitoNE/issues/15) entregue em F3-T1.

**Issues tratadas:** [#12](https://github.com/IgnisDevNE/CircuitoNE/issues/12)/[#16](https://github.com/IgnisDevNE/CircuitoNE/issues/16) e parte de [#14](https://github.com/IgnisDevNE/CircuitoNE/issues/14) em vínculo, cargo e invariantes transacionais.

**Dependência:** F3-T1; contrato RN-21 revisado.

- Testar primeiro: perfil inicial, proprietário, perfil com todas as permissões delegáveis, perfis parciais, visitante, conta removida, proprietário de outro coletivo, perfil de A atribuído em B, alteração/revogação concorrente, transferências simultâneas e tentativa de remover o proprietário. Transferir antes da saída/exclusão ou encerrar pelo suporte sem coletivo ativo órfão.
- Entrega: perfis pertencentes a um coletivo, perfil inicial Membro sem permissões, oito ações delegáveis de RN-19, FKs compostas, grants/RLS, operações atômicas e validação de vínculo/permissão atual no banco. Só o proprietário cria/edita/atribui perfis; conta criadora ou nome do perfil não é atalho permanente de autorização.
- Aceite: coletivo ativo tem exatamente um proprietário; perfil com todas as permissões não transfere propriedade, exclui o coletivo, atribui perfis nem consulta dados profissionais restritos. Transferência exige MFA dos envolvidos e rebaixa o antigo proprietário a Membro na mesma transação. Saída/exclusão do proprietário segue transferência concluída ou encerramento pelo suporte (RN-21), sem conservar conta indefinidamente por falta de sucessor. Impedir autoelevação e concessão fora do catálogo; não confiar em contagem sem trava. Funções privilegiadas têm justificativa, `search_path` fixo e `EXECUTE` restrito. Dados compartilhados após encerramento seguem #42/F6-T2, sem exclusão automática inferida.
- Documentação: matriz operação × ator, invariantes concorrentes e revisão de cada exceção a RLS.

## F3-T3 — Solicitar entrada e decidir

**Bloqueios por issue:** [#16](https://github.com/IgnisDevNE/CircuitoNE/issues/16) para invariantes; [#66](https://github.com/IgnisDevNE/CircuitoNE/issues/66) para a permissão de decidir solicitações e o perfil inicial; [#40](https://github.com/IgnisDevNE/CircuitoNE/issues/40) e parte de aprovação operacional de [#12](https://github.com/IgnisDevNE/CircuitoNE/issues/12)/[#14](https://github.com/IgnisDevNE/CircuitoNE/issues/14) verificada em F3-T5.

**Issues tratadas:** [#14](https://github.com/IgnisDevNE/CircuitoNE/issues/14)/[#15](https://github.com/IgnisDevNE/CircuitoNE/issues/15) na solicitação, decisão e vínculo de perfil inicial atômicos.

**Dependência:** F3-T2/T5 e registro revisado de RN-21 integrado.

- Testar primeiro: pedido duplicado, cancelamento, decisões simultâneas, retry, decisão em coletivo pendente, tentativa de decisão por membro sem permissão, por portador de perfil amplo de outro coletivo e leitura de solicitações alheias.
- Entrega: solicitação, aprovação/recusa/retirada, vínculo com perfil inicial sem propriedade e histórico na mesma transação; retomar o ramo de ingresso do cadastro.
- Aceite: aprovação atribui sempre Membro sem permissões, inclusive quando delegada; não escolhe perfil por nome/ordem nem concede privilégios acima do inicial. Pedidos concluídos não viram membros duplicados; solicitante vê apenas seu estado/motivo permitido.
- Documentação: estados e transições, auditoria de decisão e contrato de visibilidade.

## F3-T4 — Gestão, perfil público e diretório restrito

**Bloqueios por issue:** [#16](https://github.com/IgnisDevNE/CircuitoNE/issues/16); [#40](https://github.com/IgnisDevNE/CircuitoNE/issues/40) na integração do diretório/revogação e perfil padrão; [#66](https://github.com/IgnisDevNE/CircuitoNE/issues/66) para o catálogo de perfis; partes de autorização de [#12](https://github.com/IgnisDevNE/CircuitoNE/issues/12)/[#14](https://github.com/IgnisDevNE/CircuitoNE/issues/14) entregues em F3-T2/T5.

**Issues tratadas:** [#12](https://github.com/IgnisDevNE/CircuitoNE/issues/12)/[#15](https://github.com/IgnisDevNE/CircuitoNE/issues/15)/[#22](https://github.com/IgnisDevNE/CircuitoNE/issues/22)/[#26](https://github.com/IgnisDevNE/CircuitoNE/issues/26)/[#28](https://github.com/IgnisDevNE/CircuitoNE/issues/28) na gestão, perfil e diretório; fechar apenas critérios efetivamente concluídos.

**Dependência:** F3-T2/T5 e F2-T2. **Regras:** RN-07/18/20/22/30; D-09 e seleção de atuação pública de membro definidas.

- Testar primeiro: dados de todos os formulários persistem; HTML público só de aprovado; diretório restrito negado a conta inativa, e-mail ou celular não confirmado, sem MFA, membro sem propriedade, ex-membro e proprietário apenas de coletivos pendentes/recusados/suspensos; proprietário com outro vínculo aprovado continua elegível pelo vínculo válido. Demais membros acessam exploração interna, mas recebem somente projeções não restritas, inclusive com perfil de todas as permissões delegáveis. Revogação é considerada sem esperar novo login. Testar link para o perfil padrão da conta em dois coletivos e ausência de link quando o padrão não existir ou deixar de ser público.
- Entrega: dashboard, perfis/membros, perfil SSR e diretório profissional paginado. Membro inicial vê apenas informação pública; última atividade dos membros é exclusiva do proprietário. Contexto de coletivo não mantém dados do anterior.
- Aceite: contatos, presskit, portfólio audiovisual, cachê e lista de serviços/equipamentos disponíveis apenas ao titular e proprietário elegível conforme RN-07; CPF/nascimento fora desse acesso. Menus de exploração permanecem acessíveis aos demais membros sem enviar dados restritos. Coletivos/produtoras consultam materiais dos profissionais quando autorizados, mas não cadastram presskit, portfólio ou lista próprios. Perfil de membro aponta apenas para a atuação artística padrão da conta, escolhida pelo membro e atualmente pública (RN-20); público não recebe dados privados. Um vínculo elegível em outro coletivo preserva acesso ao diretório, sem restaurar poderes no coletivo suspenso.
- Documentação: projeções públicas/restritas, consultas/índices e controles de coleta abusiva de dados.

## F3-T5 — Administração do site e verificação

**Bloqueios por issue:** [#40](https://github.com/IgnisDevNE/CircuitoNE/issues/40) na integração do registro revisado de verificação/suspensão e contato operacional (RN-36); [#16](https://github.com/IgnisDevNE/CircuitoNE/issues/16) para integridade de cargos; [#23](https://github.com/IgnisDevNE/CircuitoNE/issues/23) para sessão segura.

**Issues tratadas:** [#12](https://github.com/IgnisDevNE/CircuitoNE/issues/12)/[#14](https://github.com/IgnisDevNE/CircuitoNE/issues/14) na aprovação operacional e ausência de autoaprovação.

**Dependência:** F3-T1/T2 e critérios de D-01/D-09 resolvidos.

- Testar primeiro: proprietário do coletivo ou portador de perfil amplo não se promove a admin do site, não se autoaprova e não altera estado por REST; sessão sem MFA não decide; duas decisões concorrentes não corrompem estado; registro de verificação sem contato/comprovação suficientes não aprova; recusa permite corrigir/reapresentar sem liberar funções; contato operacional não vaza ao público ou ao diretório.
- Entrega: provisionamento inicial controlado, MFA, fila administrativa com descrição/referências, contato direto e registro restrito da análise manual rigorosa; aprovação/recusa motivada e reapresentação; suspensão motivada por fraude/falsidade/abuso e reativação somente pela administração. CNPJ não concede aprovação automática; não presumir KYC de todos os membros.
- Aceite: aprovado libera funções pela leitura do estado atual; pendente/recusado/suspenso permanece bloqueado. Suspensão oculta perfil e eventos públicos, incluindo busca, acesso direto e cache, preservando dados para revisão conforme RN-34/#42; impede gestão/envio de mensagens e elimina elegibilidade daquele vínculo no diretório, mantendo consulta somente ao histórico de mensagens para membros ainda autorizados, além do acompanhamento da decisão/suporte. Testar restauração autorizada após revisão administrativa. O papel operacional não herda leitura de CPF ou chats. Não reintroduzir níveis numéricos como autorização paralela aos perfis.
- Documentação: quem verifica, critérios e prazos operacionais, bootstrap/revogação de admin, transições e recuperação de decisão equivocada.

A fase 3 valida a política de suspensão e as superfícies existentes. Os efeitos integrados sobre eventos e mensagens devem ser repetidos em F4-T1/T3 e F5-T1/T2; não declarar fluxos ainda inexistentes como verificados nem fechar antecipadamente essas partes de #12/#14.

## Revisão e saída

Review normal por tarefa e review completo + OWASP em `docs/reviews/phase-3.md`, com dois coletivos e identidades distintas. Executar os testes contra REST/RPC/Storage, além da UI; verificar escalada vertical/horizontal, aprovação concorrente, propriedade única/transferência e auditoria sem PII.

Ramos de criação/ingresso do onboarding passam a ter aceite integral nesta fase. Nenhuma dependência de desabilitar RLS para o frontend funcionar; homologação registra SHA e checksums das migrations.
