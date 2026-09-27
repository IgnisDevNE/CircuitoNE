# ADR 0012 — Agente Linux e integrações controladas

Data: 26/09/2026; evidências atualizadas em 27/09/2026. Estado: direção aprovada; revogações e negativas concluídas, revisão final na [#31](https://github.com/IgnisDevNE/CircuitoNE/issues/31).

## Decisão

O agente executa em container Linux Podman, como `node` (UID 1000), sem capacidades, sem elevação, com sistema somente leitura e volumes próprios para checkout, cache e autenticação Codex. O Windows continua sendo contexto do mantenedor. Não compartilhar seu disco, sessões administrativas ou socket do engine.

O responsável escolheu login ChatGPT no container e inicialização com `codex --disable plugins`. O ensaio da CLI 0.156.1 mostrou que `apps` é uma opção independente. Portanto o comando controlado usa **`--disable plugins --disable apps`**, além de política root em `/etc/codex/requirements.toml`. Essa política também desativa navegador/computer-use/remote-plugin e rejeita MCPs não autorizados. Tentativas de reativação por CLI e por configuração em outro diretório foram recusadas pelo cliente oficial.

Memtrace 1.2.8 usa a conta existente após o mantenedor remover o App GitHub da IgnisDevNE. O ensaio do broker no container retornou GitHub HTTP 404 ao procurar a instalação do CircuitoNE. A licença fica em arquivo próprio 0600 no cache isolado, sem copiar sessões GitHub, índice ou configuração do Windows. O único MCP autorizado executa `/usr/local/bin/memtrace mcp --workspace /workspace/circuito-ne`, com nome, executável e argumentos fixados pela política. Apps/plugins e demais MCPs continuam bloqueados. Indexação estrutural é a configuração inicial; embeddings ficam desativados para limitar consumo local.

A ausência da instalação é uma condição operacional: reconectar o App pode devolver autoridade GitHub à licença já presente no agente. Antes de reconectar, retirar a licença/sessão do agente e repetir a revisão do controle. O ensaio prova recusa para CircuitoNE; não afirma revogação de autorizações em outras contas. Review local por diff não precisa do broker; MCP/índice precisam de licença. A publicação pelo App Memtrace deixou de fazer parte deste setup.

A rede tem saída apenas por proxy separado, com destinos explícitos e bloqueio de endereços privados. Uma namespace nova começa inerte, sem token GitHub; o mantenedor aplica o firewall e executa negativas antes de iniciar Codex. Falha de verificação impede inicialização pelo launcher. Não reiniciar automaticamente o agente sem reaplicar o guard.

O helper do implementador consome somente token temporário do App. Emissão permanece fora do container, com chave externa e entrega em memória ao processo autorizado; nenhum arquivo de token ou chave é montado. Renovação manual. O modo de manutenção mantém autoria pelo App, sem recorrer ao login GitHub humano.

Após merge **e promoção QA do SHA exato**, o mantenedor sincroniza o checkout Windows por fast-forward. Alterações, arquivos não rastreados, outra branch, operações pendentes ou divergência interrompem a rotina; ela não aplica stash/reset nem executa hooks. O agente não escreve no Windows.

## Limites e aceite

Requisitos locais controlam o binário oficial, não revogam a autoridade cloud da conta. O cliente independente confirmou essa limitação; após retirar as conexões GitHub/Supabase, a mesma credencial recebeu catálogo fresco sem esses namespaces e ambas as chamadas de leitura foram recusadas sem resultado. Isso comprova a retirada dessas integrações, não restrição de todos os recursos cloud nem uma tentativa de escrita remota. Reconectá-las exige retirar/substituir a autenticação do agente e repetir o aceite. [Evidência](../reviews/evidence/agent-cloud-discovery-20260927.json).

Em 27/09, as instalações perderam as concessões temporárias: implementador sem Actions/Workflows write e Members read; Promoter sem Workflows. Publisher permanece sem escrita nos testes. As duas cópias locais QA identificadas foram removidas; suas chaves protegidas no GitHub continuam atendendo à esteira. A chave do emissor permanece somente no Windows de manutenção. O reensaio no container registrou sete HTTP 403 e criação/limpeza de branch comum. [Registro do gate](../reviews/agent-authority-closure-20260927.md). A #31 aguarda a revisão final desse registro antes da execução remota da #32; login ou CI verde isoladamente não fecham o controle.

Usar apenas flags seria insuficiente: outro processo poderia omiti-las. Montar a pasta Windows ou a chave privada simplificaria a operação, mas violaria a separação aprovada. Um serviço próprio de emissão de tokens não é necessário nesta etapa.

Referências: [configuração gerenciada Codex](https://learn.chatgpt.com/docs/enterprise/managed-configuration), [MCP Memtrace](https://memtrace.io/docs/cli/mcp), [review local e broker](https://memtrace.io/docs/cli/code-review), [operação do agente](../engineering/agent-runtime.md).
