# Fase 5 — Mensagens e abuso

**Estado:** planejada. **Entrada:** identidade/coletivos aprovados, D-06/D-07 resolvidas e RN-29 ratificada. A fase pode ocorrer independentemente de eventos após o gate da fase 3. **Riscos:** leitura cruzada, representação indevida e spam. [Índice e gates comuns](../implementation-plan.md).

## F5-T1 — Conversas e envio persistente

**Dependência:** F3-T2/T5 e sessão da fase 1.

- Testar primeiro: participante estranho, N0 em chat de coletivo, N2 de outro coletivo, coletivo pendente, destinatário inválido, autor forjado, representação ambígua e envio repetido após timeout.
- Entrega: criação/seleção de conversa, remetente pessoal ou coletivo explícito, mensagem persistida e idempotência por envio. Derivar autor e data da sessão/servidor.
- Aceite: N1/N2 só representam coletivo aprovado com vínculo atual; contato/convite segue D-06, sem liberar leitura geral por ser administrador do site. UI anuncia sucesso apenas após confirmação.
- Documentação: contrato de participantes, representação, estados de envio e autorização por operação.

## F5-T2 — Histórico, leitura individual e Realtime

**Dependência:** F5-T1; política de revogação aprovada.

- Testar primeiro: duas sessões, ordenação com mesmo timestamp, paginação sem lacunas, evento duplicado, desconexão/reconexão, marcação de leitura de outro usuário e remoção/rebaixamento durante assinatura aberta.
- Entrega: cursor estável, leitura por usuário/conversa, contador derivado e Realtime autorizado. Banco é a fonte do histórico; reconexão recupera mensagens perdidas.
- Aceite: revogação impede novas leituras/envios e encerra ou revalida acesso ao canal segundo comportamento demonstrado do Supabase; não presumir revogação imediata de assinatura sem teste. Troca de coletivo limpa conversa anterior.
- Documentação: cursor/idempotência, semântica de leitura, reconexão e limite de exposição durante revogação.

## F5-T3 — Limites, denúncia e bloqueio

**Dependência:** F5-T1/T2 e D-07; governança operacional definida.

- Testar primeiro: rajada de mensagens, payload grande, cadastro abusivo, bloqueio de usuário, tentativa de contornar limites pela API direta e falha do serviço de comunicação.
- Entrega: limites no ponto efetivo da operação, canal de denúncia e processo de moderação com escopo mínimo e auditoria. Começar com operação manual; fila/worker só se necessários.
- Aceite: abuso falha de forma controlada; nenhuma dependência de esconder botão ou limitar só o proxy Node; administração não ganha acesso indiscriminado a conversas para moderar.
- Documentação: limites e critérios de ajuste, escalonamento de denúncia, responsável, evidências permitidas e retenção.

## Revisão e saída

Review normal por tarefa e review completo + OWASP em `docs/reviews/phase-5.md`. Duas contas e dois coletivos em sessões distintas; comprovar histórico, não lidas individuais, bloqueio, reconexão e autorização direta. Testar indisponibilidade sem mensagens perdidas ou duplicadas e logs sem corpos de chat.
