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

Git, gh, rg, Node, pnpm e Memtrace CLI ficam na imagem. Plugins/apps Codex permanecem desativados. Nenhum MCP é habilitado por padrão. O índice Memtrace, quando autorizado, ficará no cache do container, limitado inicialmente a duas threads e sem embeddings; não montar o índice ou a licença do host. A licença de manutenção está vinculada ao App GitHub e não foi copiada. Habilitação de MCP exige identidade sem essa autoridade e revisão da entrada específica na allowlist; não abrir a lista inteira.

## Sincronizar Windows após uma PR

Depois do merge e da promoção, executar no **host**:

```powershell
node scripts/maintenance/sync-checkout.mjs D:/Repos/circuito-ne
```

A rotina lê os repositórios públicos sem credencial humana, captura os commits de `main` e `QA/accepted`, exige igualdade com `source_main_sha` e avança somente por `merge --ff-only` do SHA capturado. Não executa hooks. Trava própria impede duas sincronizações; não editar o checkout durante a execução. Recusa branch diferente de main, árvore/índice sujos, arquivos não rastreados, operação Git pendente ou commits locais divergentes. Nunca remove/stasha trabalho. Se a origem avançar durante a rotina, o resultado continua sendo o snapshot promovido informado; repetir depois da nova promoção.

É inicialmente um passo do procedimento de conclusão de PR pelo mantenedor, **sem tarefa agendada contínua**. Não há canal pelo qual o agente possa ordenar execução arbitrária no Windows. Guardar/operar o script revisado no contexto humano; não iniciar um serviço privilegiado a partir de uma branch candidata.

## Evidências e limites

Testes da imagem falharam antes da política/instalação e passaram depois, incluindo overrides `--enable`/`-c`, outro diretório de configuração e MCP canário desabilitado. As negativas de rede/capabilities passaram no Podman Windows, incluindo listener TCP canário alcançável por um controle sem guard e negado ao agente. O verificador confere inventário exato de volumes, ausência de portas, PID/IPC privados, imagem/política e as duas regras efetivas do firewall. Login ChatGPT e uma execução mínima sem ferramentas passaram. Imagem agente ensaiada: `34e4e1dff1955bb89c45bd3a6defe9995e428fab3962ff9f8ec75c6d6551b1e4`; proxy: `1577d783dcc8f023b05a47780eefb49faff1e1de064244d19746c8321e833728`.

A sincronização passou cenários de edição humana, arquivo não rastreado, branch errada, operação pendente, trava concorrente, origem incorreta, QA divergente/inválido, falha de rede e edição concorrente. Ensaio real conferiu PR #121, main `55e822779cf89cd49440310ad1053f1d2c51df88`, accepted `fd85e05b443dd844996881d11ca94755b3cc07bf`.

Isso não fecha a #31: faltam negativas GitHub na identidade isolada, restrição da autoridade cloud compartilhada, ensaios finais de QA/concorrência/recuperação e revogações. O bloqueio local de apps não prova que outro cliente usando a mesma sessão tenha perdido autoridade remota. Responsáveis: mantenedor e QA; concluir antes de homologação remota (#32).
