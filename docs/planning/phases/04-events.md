# Fase 4 — Eventos completos

**Estado:** planejada. **Entrada:** coletivos/aprovação homologados; D-04/D-05 resolvidas. **Riscos:** autoria, tempo, conteúdo e publicação. [Índice e gates comuns](../implementation-plan.md).

## F4-T1 — Evento e lineup transacionais

**Bloqueios por issue:** [#16](https://github.com/IgnisDevNE/CircuitoNE/issues/16) e aprovação operacional das partes de [#12](https://github.com/IgnisDevNE/CircuitoNE/issues/12)/[#14](https://github.com/IgnisDevNE/CircuitoNE/issues/14); [#41](https://github.com/IgnisDevNE/CircuitoNE/issues/41) para datas/estados.

**Issues tratadas:** [#18](https://github.com/IgnisDevNE/CircuitoNE/issues/18) na temporalidade persistida e [#14](https://github.com/IgnisDevNE/CircuitoNE/issues/14) na autoria/autorização do evento.

**Dependência:** F3-T2/T5 e perfis da fase 2. **Regras:** RN-23–26 e suspensão de RN-30/D-01, aprovada na #40; integrar seu registro revisado antes deste contrato.

- Testar primeiro: N2 de outro coletivo, coletivo pendente ou suspenso, lineup com perfil inválido, artista duplicado, nome livre vazio, tipo “outros” sem descrição, gratuito versus ingresso e datas incompatíveis.
- Entrega: evento + lineup em transação; cachê/valores quando aplicáveis em centavos, instantes UTC e fuso explícito conforme D-04. Não converter fim vazio em início artificial.
- Aceite: autoria vem da sessão e do vínculo aprovado; falha não deixa evento parcial; envio repetido é idempotente. Ingresso é link externo HTTP(S), sem módulo de pagamento.
- Documentação: contrato temporal, validação, atomicidade, payload e migração.

## F4-T2 — Criar, editar, publicar e cancelar

**Bloqueios por issue:** [#41](https://github.com/IgnisDevNE/CircuitoNE/issues/41); [#18](https://github.com/IgnisDevNE/CircuitoNE/issues/18) na parte de invariantes temporais entregue em F4-T1.

**Issues tratadas:** [#18](https://github.com/IgnisDevNE/CircuitoNE/issues/18) e estados de falha de [#28](https://github.com/IgnisDevNE/CircuitoNE/issues/28) no fluxo completo de evento.

**Dependência:** F4-T1; máquina de estados D-05 aprovada.

- Testar primeiro: rascunho lido anonimamente, publicação sem campos exigidos, mudança concorrente, cancelamento repetido e falha no salvamento.
- Entrega: jornadas completas, controle de versão/conflito e estados de publicação; aviso público de cancelamento conforme contrato.
- Aceite: editar não sobrescreve silenciosamente outra versão; erro preserva conteúdo digitado; transições inválidas falham no servidor e banco, não apenas no botão.
- Documentação: estados/transições, recuperação e efeitos de cancelamento/reagendamento.

## F4-T3 — Agenda e detalhes SSR coerentes

**Bloqueios por issue:** [#41](https://github.com/IgnisDevNE/CircuitoNE/issues/41) para composição da agenda; [#18](https://github.com/IgnisDevNE/CircuitoNE/issues/18) para datas/estados validados.

**Issues tratadas:** [#24](https://github.com/IgnisDevNE/CircuitoNE/issues/24) integralmente e partes de [#26](https://github.com/IgnisDevNE/CircuitoNE/issues/26)/[#28](https://github.com/IgnisDevNE/CircuitoNE/issues/28) na agenda SSR/paginação.

**Dependência:** F4-T2 e F2-T2/F3-T4.

- Testar primeiro: futuro/em andamento/passado, mudança de dia/fuso, empate na ordenação, paginação, evento com artista de outro coletivo, HTML inicial/metadados e 404 real.
- Entrega: agenda pública, evento SSR e composição dos painéis pessoal/coletivo. Definir a regra do evento de artista externo antes de fixar o teste de dashboard.
- Aceite: visitante consulta o evento publicado de coletivo aprovado, artista aparece pelo lineup e cancelamento é refletido nas superfícies; rascunho e evento de coletivo suspenso não vazam por busca, acesso direto, API ou cache. Testar suspensão depois de popular o cache e reativação administrativa, preservando o estado próprio do evento. Markdown continua seguro no servidor e navegador.
- Documentação: ordenação, filtros, consultas/índices e projeções/metadados públicos.

## Revisão e saída

Review normal por tarefa e review completo + OWASP em `docs/reviews/phase-4.md`. Cenário obrigatório: produtor cria → publica → artista aparece no lineup → visitante consulta → edição concorrente é tratada → evento cancela. Incluir conteúdo hostil, acessos cruzados e migração homologada no SHA final.
