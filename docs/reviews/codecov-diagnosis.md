# Codecov — diagnóstico e regularização

## Reavaliação de 23/09/2026

A conta pessoal autenticada já abre a organização IgnisDevNE e as configurações de CircuitoNE na instância própria. O GitHub App `ignis-dev-codecov` continua instalado com `Pull requests:write`; a chave privada presente no servidor foi aceita pela API do GitHub. A chave local é outra chave válida do mesmo App, portanto a diferença de arquivo não prova falha de integração.

As duas causas imediatas da ausência de cobertura/comentário são verificáveis no repositório: o job `codecov-upload` em `ci.yml` ainda envia para o Codecov Cloud, enquanto a instância própria não recebeu relatório; `codecov.yml` continha `comment: false`. A configuração do servidor agora inclui `setup.codecov_api_url: https://pipeline.magalz.space`, além de `codecov_url`. Antes da alteração, o arquivo foi copiado para um backup de acesso restrito no mesmo diretório; somente os quatro serviços Codecov afetados foram reiniciados. A API voltou a HTTP 200. Isso valida disponibilidade, não comprova upload nem comentário.

O environment GitHub `Codecov Upload` foi criado com regra exclusiva para `main` e recebeu o token de upload **deste repositório**. Após confirmação por passkey, a cópia antiga em secrets gerais foi removida; a lista do repositório ficou vazia. A PR de migração adiciona um publicador `workflow_run` definido em `main`: baixa apenas o LCOV do CI, verifica os jobs `quality` e `database`, identifica o SHA/PR de origem e não executa código candidato. O upload Cloud continua ativo até a instância própria processar um relatório real. Depois serão conferidos baseline, PR e comentário antes de desligá-lo. Forks continuam sem upload nesta etapa, acompanhados pela [#30](https://github.com/IgnisDevNE/CircuitoNE/issues/30).

**Estado em 22/09/2026:** o responsável voltou a escolher a instância própria e informou que corrigiu a configuração de conta e repositório; falta configurar e verificar o servidor. [ADR 0007](../decisions/0007-codecov-self-hosted-target.md) registra o novo destino. O CI continua publicando no Cloud conforme [ADR 0004](../decisions/0004-codecov-cloud.md) até validar a substituição. O diagnóstico abaixo é histórico do bloqueio OAuth; [#29](https://github.com/IgnisDevNE/CircuitoNE/issues/29) requer nova verificação, e [#30](https://github.com/IgnisDevNE/CircuitoNE/issues/30) acompanha a migração. Nenhum serviço do servidor próprio foi alterado nesta decisão.

Data: 22/09/2026. Instância: [pipeline.magalz.space](https://pipeline.magalz.space). **Resultado: correção parcial; autorização OAuth da organização deferida.** Não bloqueia o planejamento nem os testes locais.

## Causa confirmada

O Codecov usa duas integrações distintas: um OAuth App chamado **CodeCov** para login do usuário e o GitHub App **ignis-dev-codecov** para os repositórios. O App de repositórios está instalado na IgnisDevNE e consegue ler CircuitoNE. A instalação também está registrada no Codecov; a organização e o repositório já existiam no banco, portanto não foram duplicados.

A credencial OAuth usada pelo próprio Codecov tem `read:org`, mas o GitHub retorna **HTTP 403** ao consultar a associação de `magalz` à IgnisDevNE. A resposta identifica explicitamente a política de restrição a OAuth Apps da organização. A listagem de organizações retorna vazia. Instalar o GitHub App não aprova automaticamente esse outro aplicativo.

Há um efeito adicional na versão instalada: a ativação global percorre as organizações associadas ao usuário. Com a lista vazia, não altera nenhum registro, embora existam vagas. O usuário já era administrador da instância; a licença é válida até 31/12/2036, com 99 vagas. O problema observado não é falta de licença nem de privilégios administrativos no Codecov.

## Ações e verificação

- Acesso administrativo ao Debian com as credenciais temporárias autorizadas, sem publicar seu conteúdo.
- Confirmação, pela API do GitHub com token temporário do App, de acesso a CircuitoNE e de `magalz` como administrador desse repositório.
- Ativação administrativa de `magalz` no plano da IgnisDevNE pela operação nativa do modelo do Codecov, respeitando a disponibilidade de licença. A associação OAuth não foi forjada e nenhuma permissão de organização foi acrescentada manualmente.
- Habilitação de `activated` e `coverage_enabled` de CircuitoNE. O campo de atividade permanece falso: ainda não há relatório de cobertura do projeto processado.
- Nova leitura independente do banco confirmou usuário ativo, repositório habilitado e ausência de exclusão. Frontend respondeu HTTP 200; containers permaneceram em execução, sem atualização ou reinício.

Antes da alteração, os campos afetados foram salvos em `/home/magalz/codecov/config/circuitone-activation-before-20260922.json`, no servidor, com permissão `0600`. O arquivo não contém tokens e permite recuperar os valores anteriores. Uma tentativa inicial de gravar esse backup como usuário não privilegiado falhou antes de qualquer alteração; a transação foi revertida e a execução administrativa posterior concluiu normalmente.

Versão observada na interface: 26.4.1; release da API: `release-66d4494`. Não foi feita atualização de imagens: não corrigiria o bloqueio externo confirmado. A configuração OAuth existente e os demais serviços do servidor foram preservados.

## Pendente — DEF-01

Acompanhamento: [issue #29](https://github.com/IgnisDevNE/CircuitoNE/issues/29).

**Responsável:** proprietário da IgnisDevNE. **Impacto:** a organização pode continuar ausente da navegação da conta até liberar e sincronizar o OAuth. A ativação administrativa não corrige essa descoberta.

1. Na [política OAuth da IgnisDevNE](https://github.com/organizations/IgnisDevNE/settings/oauth_application_policy), revisar e conceder acesso ao aplicativo **CodeCov** usado no login. Manter a restrição geral da organização habilitada.
2. Se não houver solicitação listada, acessar as autorizações pessoais do aplicativo e solicitar/conceder acesso à IgnisDevNE; depois retornar à política da organização.
3. Refazer o login no Codecov e atualizar/sincronizar organizações e repositórios.
4. Confirmar IgnisDevNE na conta, associação OAuth sem 403 e CircuitoNE selecionável. Só então registrar DEF-01 como resolvido.

Após o login interativo, a interface administrativa confirmou a conta como **Activated**, com 1 usuário ativo de 99 vagas. O seletor de organizações mostrou apenas a organização pessoal de `magalz`; uma nova consulta confirmou que a associação OAuth à IgnisDevNE continua ausente. A integração de upload de cobertura no CI também está pendente em **F0-T13**, acompanhada pela [issue #30](https://github.com/IgnisDevNE/CircuitoNE/issues/30), incluindo um relatório real no SHA correto. Não tratar a habilitação do repositório como prova de cobertura recebida.

## Conta e alternativas de autenticação

A IgnisDevNE é uma organização do GitHub, acessada pela conta pessoal de cada membro; não existe login separado da organização. O e-mail de contato da organização não cria uma identidade para entrar no Codecov. `magalz` é a conta correta neste caso; o bloqueio confirmado é de autorização do aplicativo sobre a organização.

O caminho mínimo é aprovar o OAuth App **CodeCov** conforme DEF-01. Outra opção oficialmente suportada é configurar o login com o Client ID/Secret do GitHub App **ignis-dev-codecov**, já usado na integração de repositórios. Continua sendo login pessoal pelo GitHub; antes de migrar, conferir callback, permissões de organização/usuário, consentimento da instalação e recuperação da configuração anterior. A troca exige reinício controlado dos serviços afetados e validação interativa; não foi aplicada nesta investigação.

Não foi encontrada nas opções documentadas uma conta local de e-mail/senha que substitua o vínculo ao provedor de código. Okta/OIDC é uma camada adicional: a documentação exige primeiro o login pelo GitHub/GitLab/Bitbucket. Adicioná-lo não corrige a autorização OAuth ausente e não simplifica este caso.

## Referências

- [GitHub: aprovação de OAuth Apps da organização](https://docs.github.com/en/organizations/managing-oauth-access-to-your-organizations-data/approving-oauth-apps-for-your-organization).
- [Codecov: configuração, licença e administração](https://docs.codecov.com/docs/configuration).
- [Codecov: integração do GitHub App e login](https://docs.codecov.com/docs/how-to-create-a-github-app-for-codecov-enterprise).
- [GitHub: acesso a organizações pela conta pessoal](https://docs.github.com/en/organizations/managing-membership-in-your-organization/can-i-create-accounts-for-people-in-my-organization).
- [Codecov: provedores de login](https://docs.codecov.com/docs/set-up-oauth-login).
- [Codecov: Okta como autenticação adicional](https://docs.codecov.com/docs/securing-access-to-codecov-ui-with-okta).
