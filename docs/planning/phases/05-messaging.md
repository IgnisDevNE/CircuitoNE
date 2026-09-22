# Fase 5 — Mensagens e abuso

**Estado:** planejada. **Entrada:** identidade/coletivos aprovados, D-06/D-07 resolvidas e RN-29 ratificada. A fase pode ocorrer independentemente de eventos após o gate da fase 3. **Riscos:** leitura cruzada, representação indevida e spam. [Índice e gates comuns](../implementation-plan.md).

## F5-T1 — Conversas e envio persistente

**Bloqueios por issue:** [#42](https://github.com/IgnisDevNE/CircuitoNE/issues/42) para participantes, autoria/idempotência e revogação; partes de autorização de [#12](https://github.com/IgnisDevNE/CircuitoNE/issues/12)/[#14](https://github.com/IgnisDevNE/CircuitoNE/issues/14) e [#16](https://github.com/IgnisDevNE/CircuitoNE/issues/16) entregues na fase 3.

**Issues tratadas:** [#13](https://github.com/IgnisDevNE/CircuitoNE/issues/13)/[#14](https://github.com/IgnisDevNE/CircuitoNE/issues/14)/[#25](https://github.com/IgnisDevNE/CircuitoNE/issues/25) na criação, seleção e envio autorizados; histórico/Realtime ficam em F5-T2.

**Dependência:** F3-T2/T5 e sessão da fase 1.

- Testar primeiro: participante estranho, N0 em chat de coletivo, N2 de outro coletivo, coletivo pendente ou suspenso (RN-30/D-01), destinatário inválido, autor forjado, representação ambígua e envio repetido após timeout.
- Entrega: criação/seleção de conversa, remetente pessoal ou coletivo explícito, mensagem persistida e idempotência por envio. Derivar autor e data da sessão/servidor.
- Aceite: N1/N2 só representam coletivo aprovado com vínculo atual; contato/convite segue D-06, sem liberar leitura geral por ser administrador do site. UI anuncia sucesso apenas após confirmação.
- Documentação: contrato de participantes, representação, estados de envio e autorização por operação.

## F5-T2 — Histórico, leitura individual e Realtime

**Bloqueios por issue:** [#42](https://github.com/IgnisDevNE/CircuitoNE/issues/42) para leitura/revogação; [#25](https://github.com/IgnisDevNE/CircuitoNE/issues/25) para criação/seleção; parte de envio autorizado de [#13](https://github.com/IgnisDevNE/CircuitoNE/issues/13)/[#14](https://github.com/IgnisDevNE/CircuitoNE/issues/14) entregue em F5-T1.

**Issues tratadas:** [#13](https://github.com/IgnisDevNE/CircuitoNE/issues/13)/[#14](https://github.com/IgnisDevNE/CircuitoNE/issues/14)/[#22](https://github.com/IgnisDevNE/CircuitoNE/issues/22)/[#28](https://github.com/IgnisDevNE/CircuitoNE/issues/28) no histórico, Realtime, leitura individual e troca de contexto.

**Dependência:** F5-T1; política de revogação aprovada.

- Testar primeiro: duas sessões, ordenação com mesmo timestamp, paginação sem lacunas, evento duplicado, desconexão/reconexão, marcação de leitura de outro usuário e remoção/rebaixamento ou suspensão do coletivo durante assinatura aberta, sem afetar conversas pessoais ou de outros coletivos elegíveis.
- Entrega: cursor estável, leitura por usuário/conversa, contador derivado e Realtime autorizado. Banco é a fonte do histórico; reconexão recupera mensagens perdidas.
- Aceite: revogação impede novas leituras/envios e encerra ou revalida acesso ao canal segundo comportamento demonstrado do Supabase; não presumir revogação imediata de assinatura sem teste. Troca de coletivo limpa conversa anterior.
- Documentação: cursor/idempotência, semântica de leitura, reconexão e limite de exposição durante revogação.

## F5-T3 — Limites, denúncia e bloqueio

**Bloqueios por issue:** [#42](https://github.com/IgnisDevNE/CircuitoNE/issues/42) para limites/moderação; [#13](https://github.com/IgnisDevNE/CircuitoNE/issues/13) na autorização de envio/histórico já demonstrada.

**Issues tratadas:** Revalidar [#13](https://github.com/IgnisDevNE/CircuitoNE/issues/13)/[#14](https://github.com/IgnisDevNE/CircuitoNE/issues/14) contra abuso e acesso direto; novos achados recebem issues próprias.

**Dependência:** F5-T1/T2 e D-07; governança operacional definida.

- Testar primeiro: rajada de mensagens, payload grande, cadastro abusivo, bloqueio de usuário, tentativa de contornar limites pela API direta e falha do serviço de comunicação.
- Entrega: limites no ponto efetivo da operação, canal de denúncia e processo de moderação com escopo mínimo e auditoria. Começar com operação manual; fila/worker só se necessários.
- Aceite: abuso falha de forma controlada; nenhuma dependência de esconder botão ou limitar só o proxy Node; administração não ganha acesso indiscriminado a conversas para moderar.
- Documentação: limites e critérios de ajuste, escalonamento de denúncia, responsável, evidências permitidas e retenção.

## Revisão e saída

Review normal por tarefa e review completo + OWASP em `docs/reviews/phase-5.md`. Duas contas e dois coletivos em sessões distintas; comprovar histórico, não lidas individuais, bloqueio, reconexão e autorização direta. Testar indisponibilidade sem mensagens perdidas ou duplicadas e logs sem corpos de chat.
