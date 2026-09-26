# ADR 0011 — Node e Caddy no mesmo namespace de rede

Data: 26/09/2026. Status: proposta, dependente de revisão e homologação da PR.

## Contexto

A rede customizada do Podman permite comunicação entre containers, mas neste host Windows o encaminhamento WSL para sua porta publicada falhou. A bridge padrão funciona; usar um IP fixo da aplicação no Caddy exigiria reconfiguração ao recriar containers.

## Decisão

Usar um pod por ambiente no Podman, compartilhando somente `net`. Node escuta em `127.0.0.1:3000`; Caddy acessa esse endereço e somente sua porta 8080 é publicada. No CI Docker, Caddy usa `--network container:circuitone-app-ci`, reproduzindo o mesmo namespace. Ambos mantêm usuário sem privilégios, raiz somente leitura, capabilities removidas e limites de memória.

Criar a aplicação antes do proxy. No Docker, recriar a aplicação exige recriar o proxy que compartilha seu namespace. Não compartilhar namespaces entre ambientes. Isso impede acesso direto ao Node pela bridge; não restringe toda a saída de rede dos containers.

## Verificação e limites

No ensaio local, os testes HTTP falharam com 502 usando o destino antigo `app:3000`; passaram após a troca para loopback, inclusive após reiniciar o pod. Um container independente alcançou Caddy na bridge, mas não Node na porta 3000. O CI verifica rotas e bloqueio do acesso direto ao Node sem secrets; o reinício foi testado somente no host local.

Publicação dos domínios, proteção de acesso ao demo, produção em espera e inicialização após reinício do Windows ainda são critérios da [#43](https://github.com/IgnisDevNE/CircuitoNE/issues/43). Este ensaio não integra Supabase nem substitui homologação do produto.

Referência: [Podman pod create — compartilhamento e portas](https://docs.podman.io/en/latest/markdown/podman-pod-create.1.html).
