# ADR 0012 — Agente Linux e integrações controladas

Data: 26/09/2026. Estado: direção aprovada; bootstrap local ensaiado, aceite de segurança pendente na [#31](https://github.com/IgnisDevNE/CircuitoNE/issues/31).

## Decisão

O agente executa em container Linux Podman, como `node` (UID 1000), sem capacidades, sem elevação, com sistema somente leitura e volumes próprios para checkout, cache e autenticação Codex. O Windows continua sendo contexto do mantenedor. Não compartilhar seu disco, sessões administrativas ou socket do engine.

O responsável escolheu login ChatGPT no container e inicialização com `codex --disable plugins`. O ensaio da CLI 0.156.1 mostrou que `apps` é uma opção independente. Portanto o comando controlado usa **`--disable plugins --disable apps`**, além de política root em `/etc/codex/requirements.toml`. Essa política também desativa navegador/computer-use/remote-plugin e rejeita MCPs não autorizados. Tentativas de reativação por CLI e por configuração em outro diretório foram recusadas pelo cliente oficial.

Memtrace 1.2.8 fica instalado como CLI, sem auto-setup nem cópia da licença do mantenedor. MCP/índice com licença aguardam identidade sem autoridade GitHub, pois a sessão Memtrace atual pode obter tokens do App via broker. A revisão local por diff e o MCP têm requisitos distintos: a documentação dispensa broker para diff, mas exige sessão de licença para MCP. Não afirmar que a instalação do executável habilitou o índice. Indexação estrutural será a configuração inicial; embeddings ficam desativados para limitar consumo local.

A rede tem saída apenas por proxy separado, com destinos explícitos e bloqueio de endereços privados. Uma namespace nova começa inerte, sem token GitHub; o mantenedor aplica o firewall e executa negativas antes de iniciar Codex. Falha de verificação impede inicialização pelo launcher. Não reiniciar automaticamente o agente sem reaplicar o guard.

O helper do implementador consome somente token temporário do App. Emissão permanece fora do container, com chave externa e entrega em memória ao processo autorizado; nenhum arquivo de token ou chave é montado. Renovação manual. O modo de manutenção mantém autoria pelo App, sem recorrer ao login GitHub humano.

Após merge **e promoção QA do SHA exato**, o mantenedor sincroniza o checkout Windows por fast-forward. Alterações, arquivos não rastreados, outra branch, operações pendentes ou divergência interrompem a rotina; ela não aplica stash/reset nem executa hooks. O agente não escreve no Windows.

## Limites e aceite

Requisitos locais controlam o binário oficial, não revogam a autoridade cloud da conta. Um programa alternativo com a mesma autenticação pode desconsiderar a política; ainda não foi demonstrada uma negação administrativa cloud para esse caso. A #31 permanece aberta até resolver essa limitação, retirar permissões/chaves temporárias e concluir negativas/revisões. Não confundir login bem-sucedido com isolamento completo.

Usar apenas flags seria insuficiente: outro processo poderia omiti-las. Montar a pasta Windows ou a chave privada simplificaria a operação, mas violaria a separação aprovada. Um serviço próprio de emissão de tokens não é necessário nesta etapa.

Referências: [configuração gerenciada Codex](https://learn.chatgpt.com/docs/enterprise/managed-configuration), [MCP Memtrace](https://memtrace.io/docs/cli/mcp), [review local e broker](https://memtrace.io/docs/cli/code-review), [operação do agente](../engineering/agent-runtime.md).
