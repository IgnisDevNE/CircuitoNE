# Ambiente e operação

## Escolha de hospedagem

O responsável escolheu usar **Podman neste Windows por enquanto**, com possibilidade de levar a aplicação ao Debian próprio. O preview atual é estático: build Node/Vite e execução com Caddy. A [arquitetura aprovada em 22/09/2026](../specs/architecture-mvp.md) prevê React Router Framework com SSR, runtime Node e Caddy como proxy HTTPS. Essa migração está planejada na fase 1; os comandos abaixo ainda descrevem o protótipo estático. Supabase gerenciado continua responsável pelo banco, Auth e Storage.

O container local é preview do protótipo. Não equivale à homologação integrada com banco e não oferece disponibilidade de produção: depende deste computador e da VM ligada.

## Executar neste host

Podman 6.0.2 e máquina WSL já estavam instalados. Outros serviços ocupavam 8443, entre outras portas; eles não foram alterados. Container atual: `circuitone-preview`, imagem `localhost/circuitone:foundation`, porta 5178 → 8080.

```powershell
podman build --format docker -t localhost/circuitone:foundation .
podman run -d --name circuitone-preview --read-only --cap-drop ALL --security-opt no-new-privileges --memory 128m --cpus 1 -p 5178:8080 localhost/circuitone:foundation
```

O comando de criação é para ambiente novo, não para repetir com o nome ocupado. Para o container existente:

```powershell
podman start circuitone-preview
podman logs --tail 30 circuitone-preview
podman inspect circuitone-preview --format '{{.State.Status}} health={{.State.Health.Status}}'
podman stop circuitone-preview
```

Nesta máquina, o encaminhamento WSL para `localhost` não funcionou. O acesso validado em 21/09/2026 foi **http://172.23.250.196:5178**. O IP pode mudar ao reiniciar a VM; consultar `podman machine ssh ip -4 -brief address` e usar o endereço de `eth0`. A publicação da porta vale para as interfaces da VM; não foi configurado túnel público nem DNS. Não alteramos a rede ou reiniciamos a VM que já atende outros serviços.

```powershell
$env:HOSTING_URL = 'http://172.23.250.196:5178'
pnpm test:hosting
```

O teste verifica home, acesso direto a rota React, bundle JavaScript, bloqueio de caminhos internos e 404 de asset ausente. `--format docker` preserva o HEALTHCHECK na imagem construída pelo Podman. Processo usa UID 1000, raiz somente leitura, capabilities removidas e proibição de novos privilégios. Diretórios de runtime do Caddy são graváveis; arquivos da aplicação não são. O Caddy perde a capability gravada no binário durante o build, pois escuta em 8080 e não precisa dela.

Imagens base são fixadas por digest; Dependabot propõe atualizações revisáveis. `.dockerignore` permite somente entradas necessárias ao build. Nenhum `.env`, histórico Git ou arquivo de credenciais entra no contexto. O frontend ainda não usa Supabase. No build estático, variável em runtime não altera JavaScript já compilado. Na migração SSR, definir configuração por ambiente no servidor e expor ao cliente somente URL e chave **publicável**, com teste de seleção do projeto. Nunca incluir chave secreta no bundle.

## Ferramentas e CI

Node 22, mínimo 22.12; pnpm 10.34.3. `pnpm check` executa testes de repositório, TypeScript e build. `pnpm audit --audit-level=high` inclui dependências de desenvolvimento. CI também constrói a imagem e executa os testes HTTP no container. Actions fixadas por SHA e token somente leitura. O runner é hospedado no GitHub; não instalar runner de PR neste host nem no Debian de produção.

O workflow de CI não publica imagens, não acessa secrets e não migra banco. A automação de homologação e promoção é F0-T4/T5, depois da separação de identidade e das credenciais apropriadas. Até lá, não promover o protótipo por estar com CI verde.

## GitHub e ambientes

Repositório existente: [IgnisDevNE/CircuitoNE](https://github.com/IgnisDevNE/CircuitoNE), público na inspeção inicial; a visibilidade foi preservada. Baseline importado em `main`; preparação em `codex/project-foundation` e [PR #2](https://github.com/IgnisDevNE/CircuitoNE/pull/2). O estado verificado das proteções e do CI está no [relatório](../reviews/foundation-validation.md).

- `main`: exigir PR, revisão independente, CODEOWNERS nos contratos/testes/infra, CI e resolução de comentários; sem force push ou exclusão. Administradores também sujeitos à proteção de branch. A conta administrativa ainda pode alterar a configuração: por isso deve sair do ambiente do implementador.
- Ambiente **Homologação**: projeto `CircuitoNE-dev` (`odphoxozclrshqjgwbqk`, São Paulo), revisão de `magalz` e prevenção de autoaprovação. Variável `SUPABASE_PROJECT_REF` definida; sem secrets nesta preparação.
- Ambiente **Producao**: projeto `CircuitoNE` (`mwgccjvztzbderlwtheg`, US West), revisão de `magalz`, prevenção de autoaprovação, apenas branches protegidas (atualmente `main`). Variável de referência definida; sem secrets nesta preparação.
- Alertas de dependências/correções automáticas habilitados. Squash é o método de merge; exclusão automática de branch após merge habilitada. Branch atual permanece enquanto PR não for aprovado/concluído.

O App `ignisdevne` foi conectado em 22/09/2026, com identidade `ignisdevne[bot]`. O PR inicial de `magalz` foi encerrado e substituído pelo [PR #2](https://github.com/IgnisDevNE/CircuitoNE/pull/2), aberto pelo App, com o último push revisável também vindo dele. Assim, a revisão pode ser feita pelo humano. Um job disparado por `magalz` não pode ser aprovado por ele mesmo quando a prevenção de autoaprovação está ativa. O mantenedor prepara mudanças de workflows, que o App não pode escrever. Não remover proteção para contornar isso. CODEOWNERS só passa a valer como regra de propriedade após entrar na branch base.

### Autenticação local do App

Use o helper para comandos do agente:

```powershell
node scripts/github-app.mjs gh pr list
node scripts/github-app.mjs gh pr checks
node scripts/github-app.mjs git push
```

O helper usa Node nativo, emite um token temporário limitado ao repositório ID 1380574734 e o fornece somente ao processo `gh`/`git`. Não imprime nem grava o token; não faz login global nem substitui a credencial humana salva. Commits feitos por esse helper usam autor/committer `ignisdevne[bot]`. Para o Git, a cadeia de helpers é substituída somente no comando, sem fallback interativo para a conta humana.

A chave fornecida está em `secrets/ignisdevne.2026-09-21.private-key.pem`; a pasta inteira está ignorada pelo Git e excluída do contexto do container. Nenhum desses arquivos estava versionado na inspeção. Para outro caminho ou rotação, definir `GITHUB_APP_PRIVATE_KEY_FILE`. O arquivo `githubapp-secret.txt` não é usado por esse fluxo de autenticação por instalação.

A instalação 163660443 (App 5028495) cobre todos os repositórios da IgnisDevNE por decisão do responsável. Limitar tokens não reduz o poder da chave privada; por isso a separação definitiva exige emissor controlado fora do ambiente implementador e QA fora dessa instalação. A configuração local atual é uma etapa de bootstrap, não prova de isolamento contra processos que ainda possam acessar credenciais humanas.

## Homologação Supabase

Na inspeção, `CircuitoNE-dev` estava saudável, sem tabelas públicas e sem migrações. Nenhuma migração foi aplicada. A futura integração deve fixar CLI, preparar [migrações canônicas](../migrations/README.md) e usar credenciais de ambiente com escopo mínimo. Não pedir ou registrar secrets em chat; inseri-los no mecanismo de secrets do ambiente.

Testes destrutivos e `reset` usam banco descartável local/CI. Homologação compartilhada recebe migrações revisadas, em sequência, com bloqueio de concorrência e registro de SHA/checksum. Preview usa somente dados fictícios. Produção nunca é destino de teste de schema.

As regiões diferentes exigem decisão antes de dados reais. Banco e arquivos têm estratégias próprias de backup; registrar retenção, responsáveis, perda aceitável e tempo de recuperação. Testar restauração de ambos antes do beta; não presumir que backup de Postgres recupera objetos de Storage.

## Caminho para Debian

1. Confirmar recursos, arquitetura, serviços existentes, acesso administrativo e política de atualização do servidor.
2. Após a migração SSR, executar o runtime Node e o proxy Caddy revisados por digest com Podman rootless; serviço systemd/Quadlet para reinício e logs. Não fazer build de PR no host de produção. O container estático atual não entrega SSR.
3. Configurar proxy HTTPS e DNS, por exemplo `circuito.magalz.space` e subdomínio distinto de homologação (nomes apenas propostos). O domínio final ainda não foi criado/configurado. Certificados automáticos dependem de DNS e conectividade corretos.
4. Restringir portas, proteger o acesso administrativo, monitorar disponibilidade e espaço, registrar rotação de logs e alertas. Servir a aplicação atrás de HTTPS; HTTP do preview local não é configuração de produção.
5. Promover artefato homologado, testar home/deep link/Auth, e manter digest anterior para rollback. Migrações precisam de plano próprio; voltar o container não desfaz SQL.

Previews de PR serão criados sob demanda no início e removidos ao encerrar o PR. Evitar multiplicar banco/servidor por PR antes de haver necessidade. Na integração, impedir que um preview acesse dados de produção e limitar URLs de callback do Auth por ambiente.

Referências: [Caddy para SPAs](https://caddyserver.com/docs/caddyfile/patterns#single-page-apps-spas), [HTTPS automático](https://caddyserver.com/docs/automatic-https), [Supabase: ambientes](https://supabase.com/docs/guides/deployment/managing-environments).
