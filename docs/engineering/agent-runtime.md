# Operação do agente isolado

Estado em 26/09/2026: bootstrap local em ensaio, [#31](https://github.com/IgnisDevNE/CircuitoNE/issues/31) aberta. Esta sessão Windows é manutenção. O container não recebe chaves privadas, licenças privilegiadas ou sessões GitHub/Supabase do mantenedor. Não aplicar migrações remotas antes do aceite da #31.

## Preparar e iniciar no host

Executar a versão revisada desses scripts no Windows. A imagem fixa Node 24.21.0, pnpm 10.34.3, Codex 0.156.1 e Memtrace 1.2.8; imagens base fixadas por digest. Revisar atualizações por PR e registrar a imagem final efetivamente ensaiada.

```powershell
podman build --target agent -f deploy/agent/Dockerfile -t localhost/circuitone-agent:bootstrap .
podman build --target network -f deploy/agent/Dockerfile -t localhost/circuitone-agent-network:bootstrap .
./deploy/agent/manage.ps1 -Action Prepare
./deploy/agent/manage.ps1 -Action Login
```

`Prepare` exige nomes de containers livres e cria somente os recursos `circuitone-agent-*`. O agente começa em `sleep`, o helper efêmero aplica nftables na namespace dele e termina; somente esse helper recebe `NET_ADMIN`. O teste verifica usuário, capabilities, no-new-privileges, saída direta negada, CONNECT proibido e acesso permitido à API GitHub pelo proxy. Não há publicação de portas, bind mounts ou reinício automático. `Verify` repete as verificações; `Stop` remove somente os dois containers, preservando os volumes. Nunca usar `podman start` isoladamente para retomar este agente: recriar com `Prepare`, reaplicando o firewall.

Uma única vez, preparar o clone **dentro** do volume, sem copiar `secrets/` nem configuração Git humana:

```powershell
podman exec circuitone-agent git -c credential.helper= -c core.hooksPath=/dev/null clone --no-checkout https://github.com/IgnisDevNE/CircuitoNE.git /workspace/circuito-ne
# Fazer checkout do SHA aprovado/promovido, depois iniciar branch nova para a tarefa.
podman exec --workdir /workspace/circuito-ne circuitone-agent git -c core.hooksPath=/dev/null checkout --detach <SHA-promovido>
```

`Login` usa autorização de dispositivo; completar no navegador humano. A autenticação fica apenas no volume Codex. O comando `Run` inicia sem token GitHub; para trabalho autenticado usar o emissor externo abaixo. Build/teste que precise de containers fica no CI, sem socket do engine no agente.

## Token temporário do implementador

No host, definir `GITHUB_APP_PRIVATE_KEY_FILE` para a chave externa ao ambiente do agente e executar:

```powershell
node scripts/maintenance/issue-github-token.mjs
```

O emissor valida o container, pede token somente para CircuitoNE e o entrega por ambiente ao processo `circuitone-agent`. Não imprime o token, não escreve JSON e não o coloca em argumentos. O agente usa `node scripts/github-app.mjs gh ...` / `git ...`; token ausente/expirado falha sem fallback. Encerrar a sessão e repetir o comando para renovar. O mantenedor pode usar `issue-github-token.mjs --host gh ...` / `--host git ...` para manutenção pela mesma identidade App; isso não é um comando cotidiano do implementador.

As permissões temporárias de bootstrap ainda não foram revogadas. Variáveis de opt-in Actions/Workflows pertencem exclusivamente à manutenção até o gate final; não fornecê-las ao implementador. Retirar também a concessão na instalação, pois reduzir apenas o pedido do token não restringe uma chave ainda acessível.

## Memtrace e demais ferramentas

Git, gh, rg, Node, pnpm e Memtrace ficam na imagem. Plugins/apps Codex permanecem desativados. Somente o MCP `memtrace` é autorizado: executável absoluto e argumentos exatos em política root; sua configuração padrão fica em `/etc/codex/config.toml`. A configuração encaminha explicitamente os caminhos XDG/MemDB, proxy e limites Memtrace ao subprocesso, sem variáveis de credenciais GitHub. Índice e licença ficam no cache próprio do container, limitado inicialmente a duas threads e sem embeddings. O diretório fixo de registros `~/.memtrace` aponta para esse mesmo cache; o restante do sistema continua somente leitura. Não montar índice/configuração ou sessões do host. O proxy permite apenas `memtrace.io` e `www.memtrace.io`, sem liberar subdomínios arbitrários.

O mantenedor removeu a instalação GitHub do Memtrace antes de habilitar a licença. Uma credencial mínima foi transferida por stdin para `$XDG_CONFIG_HOME/memtrace/credentials.json` (0600), sem valor em argumentos, imagem, commit ou logs. Em um bootstrap novo, autenticar com `memtrace auth login` no container e concluir no navegador do mantenedor; indexar o checkout antes de iniciar o MCP. Não copiar o arquivo de credenciais completo do Windows. A licença não deve acompanhar um App GitHub reconectado: antes de reinstalar/reativar essa integração, retirar a licença/sessão do agente e repetir a revisão. A recusa foi demonstrada para CircuitoNE, não para outras contas/instalações.

```powershell
podman exec -it --workdir /workspace/circuito-ne circuitone-agent memtrace auth login
podman exec --workdir /workspace/circuito-ne --env MEMTRACE_NO_REPLAY=1 circuitone-agent memtrace index /workspace/circuito-ne
```

O primeiro ensaio do broker criou um store vazio sem manifesto de escopo. Esse store descartável foi arquivado pelo comando de recuperação do Memtrace, antes da primeira indexação. Não usar `--clear` como rotina nem contra índices existentes. O fluxo acima inicializa o índice antes da revisão de PR.

## Sincronizar Windows após uma PR

Depois do merge e da promoção, executar no **host**:

```powershell
node scripts/maintenance/sync-checkout.mjs D:/Repos/circuito-ne
```

A rotina lê os repositórios públicos sem credencial humana, captura os commits de `main` e `QA/accepted`, exige igualdade com `source_main_sha` e avança somente por `merge --ff-only` do SHA capturado. Não executa hooks. Trava própria impede duas sincronizações; não editar o checkout durante a execução. Recusa branch diferente de main, árvore/índice sujos, arquivos não rastreados, operação Git pendente ou commits locais divergentes. Nunca remove/stasha trabalho. Se a origem avançar durante a rotina, o resultado continua sendo o snapshot promovido informado; repetir depois da nova promoção.

É inicialmente um passo do procedimento de conclusão de PR pelo mantenedor, **sem tarefa agendada contínua**. Não há canal pelo qual o agente possa ordenar execução arbitrária no Windows. Guardar/operar o script revisado no contexto humano; não iniciar um serviço privilegiado a partir de uma branch candidata.

## Evidências e limites

Testes da imagem falharam antes da política/instalação e passaram depois, incluindo overrides `--enable`/`-c`, outro diretório de configuração, MCP canário desabilitado e substituição recusada do comando/argumentos Memtrace. Os novos destinos Memtrace retornaram 403 antes da liberação e CONNECT 200 depois; subdomínios não autorizados continuam recusados. As negativas de rede/capabilities passaram no Podman Windows, incluindo listener TCP canário alcançável por um controle sem guard e negado ao agente. O verificador confere inventário exato de volumes, ausência de portas, PID/IPC privados, imagem/política e as duas regras efetivas do firewall. Login ChatGPT e uma execução mínima sem ferramentas passaram. Imagem agente ensaiada: `5db202f45b102e9e88fa2b787718984c67809ab40d22d6a6c336da7c7c58f6a0`; proxy: `e8a9cbc795bb33704ca674898203cf69bf03752517477382173497fcfd67a54b`.

Memtrace indexou 173 arquivos (2.570 nós, 9.287 relações); o MCP listou o repositório e encontrou `validateRuntimeEnv`. O ensaio pelo próprio Codex também concluiu `find_code`, sem shell ou consulta GitHub. O broker foi reensaiado depois e permaneceu recusado por instalação inexistente. Os seis testes da imagem e os quatro testes relacionados de helper/sincronização passaram. [Evidência sem credenciais](../reviews/evidence/agent-memtrace-20260926.json).

A sincronização passou cenários de edição humana, arquivo não rastreado, branch errada, operação pendente, trava concorrente, origem incorreta, QA divergente/inválido, falha de rede e edição concorrente. Ensaio real conferiu PR #121, main `55e822779cf89cd49440310ad1053f1d2c51df88`, accepted `fd85e05b443dd844996881d11ca94755b3cc07bf`.

Isso não fecha a #31: faltam negativas GitHub na identidade isolada, restrição da autoridade cloud compartilhada, ensaios finais de QA/concorrência/recuperação e revogações. O bloqueio local de apps não prova que outro cliente usando a mesma sessão tenha perdido autoridade remota. Responsáveis: mantenedor e QA; concluir antes de homologação remota (#32).
