# Fase 3 — Coletivos, aprovação e autorização

**Estado:** planejada. **Entrada:** fases 1–2 aprovadas; critérios operacionais de D-01/D-09 e propostas RN-21 ratificados antes dos contratos correspondentes. **Risco principal:** elevação de privilégio entre coletivos. [Índice e gates comuns](../implementation-plan.md).

**Ordem:** T1 → T2 → T5 → T3/T4. Os IDs preservam a correspondência do backlog anterior, mas a aprovação operacional precisa existir antes de liberar gestão/diretório.

## F3-T1 — Criar coletivo/produtora pendente

**Dependência:** F1-T2 e F2-T1. **Regras:** RN-15/16/30.

- Testar primeiro: criação repetida/concorrente, produtora sem CNPJ, CNPJ alfanumérico, falha no vínculo inicial e tentativa de o criador definir estado aprovado.
- Entrega: transação para dados públicos/privados, estado pendente, cargos e primeiro N2; tela de acompanhamento para o criador, com acesso distinto do dashboard interno.
- Aceite: coletivo pendente não aparece publicamente nem habilita dashboard, eventos, mensagens ou diretório, inclusive ao criador. Retomar o ramo de criação do onboarding somente com resultado persistido.
- Documentação: máquina de estados da solicitação, payload privado/público e recuperação/idempotência.

## F3-T2 — Vínculos, cargos e invariantes

**Dependência:** F3-T1; contrato RN-21 revisado.

- Testar primeiro: N0/N1/N2, visitante, conta removida, N2 de outro coletivo, cargo de A atribuído em B, troca de proprietário e duas remoções/rebaixamentos simultâneos do último N2.
- Entrega: FKs compostas, grants/RLS, operações atômicas e validação de vínculo/cargo atual no banco. Conta criadora não é atalho permanente de autorização.
- Aceite: último N2 preservado também ao editar nível do cargo, sair ou excluir conta; não confiar em contagem sem trava. Funções privilegiadas têm justificativa, `search_path` fixo e `EXECUTE` restrito.
- Documentação: matriz operação × ator, invariantes concorrentes e revisão de cada exceção a RLS.

## F3-T3 — Solicitar entrada e decidir

**Dependência:** F3-T2/T5; RN-21 ratificada.

- Testar primeiro: pedido duplicado, cancelamento, decisões simultâneas, retry, decisão em coletivo pendente e leitura de solicitações alheias.
- Entrega: solicitação, aprovação/recusa/retirada, vínculo N0 e histórico na mesma transação; retomar o ramo de ingresso do cadastro.
- Aceite: aprovação não escolhe o menor cargo disponível se ele tiver privilégio maior que N0; pedidos concluídos não viram membros duplicados; solicitante vê apenas seu estado/motivo permitido.
- Documentação: estados e transições, auditoria de decisão e contrato de visibilidade.

## F3-T4 — Gestão, perfil público e diretório restrito

**Dependência:** F3-T2/T5 e F2-T2. **Regras:** RN-07/18/20/22/30; D-09 e seleção de atuação pública de membro definidas.

- Testar primeiro: dados de todos os formulários persistem; HTML público só de aprovado; pendente/recusado não habilita diretório; N2 com outro vínculo aprovado continua elegível pelo vínculo válido; revogação é considerada sem esperar novo login.
- Entrega: dashboard, cargos/membros, perfil SSR e diretório profissional paginado. Contexto de coletivo não mantém dados do anterior.
- Aceite: contatos/presskit/cachê disponíveis apenas ao titular e N2 elegível; CPF/nascimento fora desse acesso. Perfil de membro tem link apenas quando houver atuação artística escolhida e publicável; público não recebe dados privados.
- Documentação: projeções públicas/restritas, consultas/índices e controles de coleta abusiva de dados.

## F3-T5 — Administração do site e verificação

**Dependência:** F3-T1/T2 e critérios de D-01/D-09 resolvidos.

- Testar primeiro: N2 não se promove a admin do site, não se autoaprova e não altera estado por REST; sessão sem MFA não decide; duas decisões concorrentes não corrompem estado; suspensão revoga funções conforme contrato aprovado.
- Entrega: provisionamento inicial controlado, MFA, fila administrativa, aprovação/recusa com motivo e auditoria; fluxo de correção/reapresentação e suspensão definido antes de implementado.
- Aceite: aprovado libera funções pela leitura do estado atual; recusado/pending permanece bloqueado. O papel operacional não herda leitura de CPF ou chats. Não implementar um nível 3 nos cargos de coletivo.
- Documentação: quem verifica, critérios e prazos operacionais, bootstrap/revogação de admin, transições e recuperação de decisão equivocada.

## Revisão e saída

Review normal por tarefa e review completo + OWASP em `docs/reviews/phase-3.md`, com dois coletivos e identidades distintas. Executar os testes contra REST/RPC/Storage, além da UI; verificar escalada vertical/horizontal, aprovação concorrente, último administrador e auditoria sem PII.

Ramos de criação/ingresso do onboarding passam a ter aceite integral nesta fase. Nenhuma dependência de desabilitar RLS para o frontend funcionar; homologação registra SHA e checksums das migrations.
