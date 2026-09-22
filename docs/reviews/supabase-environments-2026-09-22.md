# Auditoria dos ambientes Supabase — 22/09/2026

Estado: **configuração inicial confirmada; sem liberação para integração ou produção**. Inspeção somente leitura por conector Supabase, painel web após login do responsável e App do GitHub. Nenhuma migração, usuário, bucket, chave ou configuração remota foi criada ou alterada.

| Verificação | Homologação | Produção |
|---|---|---|
| Nome / referência | `CircuitoNE-dev` / `odphoxozclrshqjgwbqk` | `CircuitoNE` / `mwgccjvztzbderlwtheg` |
| Região | `sa-east-1` (São Paulo) | `us-west-2` (Oregon) |
| Estado | `ACTIVE_HEALTHY` | `ACTIVE_HEALTHY` |
| Postgres | 17.6.1.166, canal GA | 17.6.1.166, canal GA |
| Tabelas públicas / migrações | 0 / 0 | 0 / 0 |
| Usuários Auth / buckets Storage | 0 / 0 | 0 / 0 |
| Advisor de segurança | Nenhum alerta retornado | Nenhum alerta retornado |
| Chaves de cliente | Publicável moderna e `anon` legada habilitadas | Publicável moderna e `anon` legada habilitadas |
| Environment GitHub | `Homologação` | `Producao` |
| Aprovação de environment | `magalz`, autoaprovação impedida | `magalz`, autoaprovação impedida |
| Restrição de branch do environment | Não configurada | Apenas branches protegidas |

Ausência de alertas em bancos vazios não comprova autorização do produto. Não existem políticas/tabelas de negócio a testar. A consulta opcional `current_setting('pgrst.db_schemas', true)` retornou `null`; o painel confirmou que a Data API está instalada, com exposição automática de novas tabelas habilitada, dois schemas expostos e limite de 1.000 linhas. Em homologação, os schemas são `public` e `graphql_public`. A consulta a `pg_default_acl` confirmou, em ambos, concessões automáticas a `anon`/`authenticated` para novos objetos de `public` criados por `postgres` e `supabase_admin`.

## Auth: configuração observada nos dois projetos

| Controle | Estado verificado |
|---|---|
| Site URL / redirects adicionais | `http://localhost:3000` / nenhum |
| SMTP próprio | Desligado; templates padrão |
| Cadastro / provedor e-mail / confirmação de e-mail | Habilitados |
| Login anônimo / associação manual / provedores sociais | Desligados |
| Confirmação de troca no e-mail antigo e novo | Habilitada |
| Senha mínima / proteção contra senha vazada | 6 caracteres / desligada; proteção contra vazamento exige plano Pro |
| Troca segura de senha / exigir senha atual | Desligadas |
| OTP de e-mail | 8 dígitos; validade 3.600 segundos |
| MFA TOTP / máximo de fatores | Habilitado / 10 por usuário |
| Limitação de AAL1 para quem precisa validar fator | Habilitada, 15 minutos |
| Token de acesso | Validade 3.600 segundos |
| Detecção de reutilização de refresh token / tolerância | Habilitada / 10 segundos |
| Sessão única / limite de duração / inatividade | Desligada / 0 / 0; configuração indicada como recurso Pro |
| CAPTCHA | Desligado |
| Limites por IP em cinco minutos | 150 refreshes, 30 verificações, 30 cadastros/logins |
| Encaminhamento de IP ao Auth com chave secreta | Desligado |

MFA disponível não significa MFA exigido para administradores pela aplicação; essa exigência precisa de implementação/teste de AAL2. O selo `main PRODUCTION` do painel refere-se à branch principal de cada projeto Supabase, inclusive `CircuitoNE-dev`; não troca a finalidade definida para esse projeto.

## Verificações ainda pendentes

- **Auth:** substituir os destinos padrão por URLs corretas e distintas, preparar allowlist exata e testar confirmação/recuperação/redirecionamento externo antes de contas reais. Endurecer senha e ações sensíveis; cobrir revogação e duração de sessão. Não basta reduzir a validade do JWT se o refresh continuar válido.
- **Data API:** antes da primeira tabela de negócio, remover concessões automáticas amplas e declarar grants/RLS/políticas em migrações revisadas. Ensaiar negações no banco descartável e homologar pelo GitHub; não alterar schema de produção pela interface.
- **SMTP:** próprio desligado; remetente, credenciais e entrega a destinatário controlado ainda pendentes. O serviço padrão é restrito e não equivale a envio operacional aprovado. Não enviar mensagens a usuários reais como teste.
- **GitHub:** leitura atual de variáveis e nomes dos secrets retornou HTTP 403 pelo App. O guia registra `SUPABASE_PROJECT_REF` nos dois environments, mas esse valor não pôde ser revalidado. Não foram usadas credenciais humanas como alternativa.
- **Integração:** o CI vigente não migra banco nem implanta a aplicação. O container local usa mocks; não é homologação integrada.
- **Destino e recuperação:** regiões distintas, domínio/TLS, callbacks estáveis, RPO/RTO e restauração de banco e objetos precisam de definição/ensaio antes de dados reais.

## Encaminhamento

Manter [#31](https://github.com/IgnisDevNE/CircuitoNE/issues/31) para autoridade de QA e credenciais, [#32](https://github.com/IgnisDevNE/CircuitoNE/issues/32) para migrações/homologação e grants, [#43](https://github.com/IgnisDevNE/CircuitoNE/issues/43) para URLs/SMTP/regiões e [#23](https://github.com/IgnisDevNE/CircuitoNE/issues/23) para política e fluxos de sessão/segurança/abuso. O responsável já forneceu a sessão do painel; permanecem as configurações fora do alcance do App e o aceite operacional. O implementador prepara mudanças e evidências revisáveis. Os gates continuam bloqueados até a verificação correspondente.

Podem avançar: testes com fixtures, dependências, cobertura local, documentação e ensaios sem credenciais em banco descartável. Review consultivo por subagente Sol com esforço baixo avaliou os contratos e as evidências coletadas pelo implementador. Destacou grants, callbacks, senha/sessão e e-mail como requisitos anteriores aos dados reais; não fez uma segunda inspeção remota nem substitui o QA isolado. Regiões diferentes são decisão operacional pendente, não evidência de vazamento. Nenhum dado de negócio existia nos ambientes inspecionados; esta auditoria não avaliou exposição histórica nem controles ainda inexistentes.

Referências: [guia de ambiente](../engineering/environment.md), [fase zero](../planning/phases/00-foundation.md), [Supabase: checklist de produção](https://supabase.com/docs/guides/deployment/going-into-prod), [URLs de retorno](https://supabase.com/docs/guides/auth/redirect-urls).
