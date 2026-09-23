# ADR 0007 — Retorno ao Codecov próprio

Data: 22/09/2026. **Decisão aprovada; migração operacional pendente.** Substitui o destino pretendido na [ADR 0004](0004-codecov-cloud.md), sem afirmar que o workflow atual já foi migrado.

O responsável voltou a escolher a instância própria em `pipeline.magalz.space` e informou que a configuração de conta e repositório no Codecov foi corrigida. Falta configurar e validar o servidor. O upload vigente do CI ainda usa Codecov Cloud; mantê-lo até um upload real da instância própria ser recebido e associado ao repositório, SHA e branch corretos. Não remover um caminho que já funciona antes de comprovar o substituto.

Na migração, preservar o isolamento do publicador: ele recebe apenas o LCOV da execução aprovada, não executa a aplicação nem expõe credenciais a código de PR. Credenciais da instância própria ficam fora do App implementador e de artefatos/logs, conforme [#31](https://github.com/IgnisDevNE/CircuitoNE/issues/31). Confirmar o caminho de autenticação suportado pelo servidor antes de mudar o workflow; não presumir que o OIDC usado pelo Cloud funcionará na instância própria. Falhas de upload deixam evidência local no CI e não dispensam testes ou aceite canônico.

Verificar login/organização/repositório na instância própria ([#29](https://github.com/IgnisDevNE/CircuitoNE/issues/29)), então concluir servidor, upload e troca controlada no CI ([#30](https://github.com/IgnisDevNE/CircuitoNE/issues/30)). Os detalhes operacionais ficam no [diagnóstico](../reviews/codecov-diagnosis.md); esta decisão não autoriza alterar outros serviços do host.
