# ADR 0009 — QA público com branches protegidas e promotor separado

Data: 24/09/2026. **Estado:** adotada; validação pós-proteção e isolamento final de credenciais pendentes na [#31](https://github.com/IgnisDevNE/CircuitoNE/issues/31).

## Contexto

No plano Free da organização, o QA privado não aplicava proteção nativa de branches. Revisão operacional e manifesto da suíte não impediam uma credencial com escrita de alterar testes e referência juntos. Antes de mudar a visibilidade, auditamos as referências Git e os logs de Actions acessíveis; não encontramos padrões de segredos, com quatro runs de log indisponível ou parcial registrados na #31. A auditoria não prova ausência absoluta de dados sensíveis.

## Decisão

Tornar `IgnisDevNE/CircuitoNE-QA` público e proteger `main` e `accepted` por rulesets nativos. `main` exige PR, aprovação independente do último push, check `scripts` originado em GitHub Actions e não admite bypass. `accepted` exige PR/revisão para pessoas e Apps comuns, mas admite bypass apenas do App `CircuitoNE QA Promoter` (5055320), instalado somente no QA com `Contents:write`. Sua chave fica no environment `QA Promotion`, limitado à branch `main`. O App `CircuitoNE QA Publisher` continua com `Contents:read` e publica o check no repositório principal; o App implementador não está instalado no QA.

Regras ativas: [main 23916588](https://github.com/IgnisDevNE/CircuitoNE-QA/rules/23916588) e [accepted 23916592](https://github.com/IgnisDevNE/CircuitoNE-QA/rules/23916592). A API de regras efetivas confirmou as duas; atualizações diretas inofensivas com a conta humana receberam HTTP 422. A [QA PR #20](https://github.com/IgnisDevNE/CircuitoNE-QA/pull/20) instalou o promotor separado e seu [CI pós-merge](https://github.com/IgnisDevNE/CircuitoNE-QA/actions/runs/35951712724) passou antes da ativação dos rulesets.

## Consequências

- Os testes são legíveis publicamente. A garantia buscada é integridade da referência e separação da autoridade de publicação, não sigilo dos testes.
- O App promotor tem bypass deliberado somente em `accepted`; sua chave e o workflow confiável que a usa são ativos críticos. Um ensaio positivo de promoção após a ativação das regras e os testes negativos restantes ainda são necessários.
- Admins e credenciais humanas acessíveis ao ambiente do agente continuam fora da fronteira de isolamento até a limpeza final da #31. Mudanças futuras no verificador de `main` exigem PR, check e revisor independente; a própria conta autora não pode aprová-las.

## Alternativas

Manter QA privado com revisão apenas operacional foi rejeitado por não impor o gate no GitHub. Migrar para GitHub Team foi adiado por custo, pois o QA público com rulesets cobre o controle de escrita requerido depois da auditoria de exposição.
