# Fase 5 — Mensagens e abuso

**Estado:** planejada. **Entrada:** identidade/coletivos aprovados e decisões restantes da #42 integradas a RN-28/RN-29. A fase pode ocorrer independentemente de eventos após o gate da fase 3. **Riscos:** leitura cruzada, representação indevida e spam. [Índice e gates comuns](../implementation-plan.md).

## F5-T1 — Conversas e envio persistente

**Bloqueios por issue:** [#42](https://github.com/IgnisDevNE/CircuitoNE/issues/42) para participantes, autoria/idempotência e revogação; [#66](https://github.com/IgnisDevNE/CircuitoNE/issues/66) para permissões de mensagens; partes de autorização de [#12](https://github.com/IgnisDevNE/CircuitoNE/issues/12)/[#14](https://github.com/IgnisDevNE/CircuitoNE/issues/14) e [#16](https://github.com/IgnisDevNE/CircuitoNE/issues/16) entregues na fase 3.

**Issues tratadas:** [#13](https://github.com/IgnisDevNE/CircuitoNE/issues/13)/[#14](https://github.com/IgnisDevNE/CircuitoNE/issues/14)/[#25](https://github.com/IgnisDevNE/CircuitoNE/issues/25) na criação, seleção e envio autorizados; histórico/Realtime ficam em F5-T2.

**Dependência:** F3-T2/T5 e sessão da fase 1.

- Testar primeiro: participante estranho, conta sem e-mail/celular confirmados, membro sem permissão específica, proprietário de outro coletivo, coletivo pendente ou suspenso (RN-30), destinatário inválido, autor forjado, representação ambígua e envio repetido após timeout.
- Entrega: criação/seleção de conversa, remetente pessoal ou coletivo explícito, texto e emoji persistidos sem anexos, e idempotência por envio. Derivar autor e data da sessão/servidor.
- Aceite: conta pessoal elegível contata artista público ou coletivo aprovado; proprietário e membro com perfil autorizado só representam coletivo aprovado com vínculo atual. Administração do site não ganha leitura geral de conversas. UI anuncia sucesso apenas após confirmação.
- Documentação: contrato de participantes, representação, estados de envio e autorização por operação.

## F5-T2 — Histórico, leitura individual e Realtime

**Bloqueios por issue:** [#42](https://github.com/IgnisDevNE/CircuitoNE/issues/42) para leitura/revogação; [#25](https://github.com/IgnisDevNE/CircuitoNE/issues/25) para criação/seleção; parte de envio autorizado de [#13](https://github.com/IgnisDevNE/CircuitoNE/issues/13)/[#14](https://github.com/IgnisDevNE/CircuitoNE/issues/14) entregue em F5-T1.

**Issues tratadas:** [#13](https://github.com/IgnisDevNE/CircuitoNE/issues/13)/[#14](https://github.com/IgnisDevNE/CircuitoNE/issues/14)/[#22](https://github.com/IgnisDevNE/CircuitoNE/issues/22)/[#28](https://github.com/IgnisDevNE/CircuitoNE/issues/28) no histórico, Realtime, leitura individual e troca de contexto.

**Dependência:** F5-T1; política de revogação aprovada.

- Testar primeiro: duas sessões, ordenação com mesmo timestamp, paginação sem lacunas, evento duplicado, desconexão/reconexão, marcação de leitura de outro usuário, revogação de permissão e suspensão durante assinatura aberta, cancelamento/exclusão do coletivo sem acesso residual, sem afetar conversas pessoais ou de outros coletivos elegíveis.
- Entrega: cursor estável, leitura por usuário/conversa, contador derivado e Realtime autorizado. Banco é a fonte do histórico; reconexão recupera mensagens perdidas.
- Aceite: revogação da permissão impede novas leituras/envios; suspensão mantém apenas histórico para membros ainda autorizados e impede novos envios; cancelamento/exclusão retira todo acesso da identidade coletiva. Encerrar ou revalidar o canal segundo comportamento demonstrado do Supabase, sem presumir revogação imediata de assinatura sem teste. Troca de coletivo limpa conversa anterior.
- Documentação: cursor/idempotência, semântica de leitura, reconexão e limite de exposição durante revogação.

## F5-T3 — Limites, denúncia e bloqueio

**Bloqueios por issue:** [#42](https://github.com/IgnisDevNE/CircuitoNE/issues/42) para limites/moderação; [#13](https://github.com/IgnisDevNE/CircuitoNE/issues/13) na autorização de envio/histórico já demonstrada.

**Issues tratadas:** Revalidar [#13](https://github.com/IgnisDevNE/CircuitoNE/issues/13)/[#14](https://github.com/IgnisDevNE/CircuitoNE/issues/14) contra abuso e acesso direto; novos achados recebem issues próprias.

**Dependência:** F5-T1/T2 e D-07; governança operacional definida.

- Testar primeiro: rajada de mensagens, payload grande, emoji, tentativa de anexo, cadastro abusivo, bloqueio de usuário, tentativa de contornar limites pela API direta e falha do serviço de comunicação.
- Entrega: limites iniciais de tamanho/frequência no ponto efetivo da operação, bloqueio de novos envios, denúncia com trecho selecionado e contexto mínimo, e análise manual auditável. Começar sem fila/worker ou funções de chat completo.
- Aceite: abuso falha de forma controlada; nenhuma dependência de esconder botão ou limitar só o proxy Node; administração não ganha acesso indiscriminado a conversas para moderar.
- Documentação: valores iniciais de limites e critérios de ajuste, escalonamento de denúncia, responsável, evidências permitidas e retenção aprovada na #42.

## Revisão e saída

Review normal por tarefa e review completo + OWASP em `docs/reviews/phase-5.md`. Duas contas e dois coletivos em sessões distintas; comprovar histórico, não lidas individuais, permissão delegada/revogação, bloqueio, reconexão e autorização direta. Verificar suspensão com histórico somente leitura, cancelamento/exclusão sem acesso e rejeição de anexos. Testar indisponibilidade sem mensagens perdidas ou duplicadas e logs sem corpos de chat.
