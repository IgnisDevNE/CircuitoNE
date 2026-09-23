# Ambientes, domínios e dados de teste

Data: 22/09/2026. **Requisitos confirmados pelo responsável; implantação e integração pendentes.** Complementa a [arquitetura do MVP](architecture-mvp.md). Não declara DNS, containers SSR ou Auth já operacionais.

| Ambiente | Endereço aprovado | Banco | Dados e autenticação |
|---|---|---|---|
| Produção | `https://circuitone.magalz.space` | `CircuitoNE` (`ukyoyrmebwadmuzkswdw`, São Paulo) | Dados reais somente após homologação; Supabase Auth, sem login demo/seed de teste |
| Dev/homologação | `https://circuitone-dev.magalz.space` | `CircuitoNE-dev` (`odphoxozclrshqjgwbqk`) | Muitos cenários sintéticos persistidos; contas de teste identificadas e Supabase Auth ao integrar |
| Testes de PR | Runner descartável sem domínio público | Supabase local descartável | Migrações, fixtures e Playwright sem credenciais de ambientes compartilhados |

**Região e credenciais verificadas; integração pendente em #43:** a [auditoria original](../reviews/supabase-environments-2026-09-22.md) registrou dev em São Paulo (`sa-east-1`) e produção antiga em Oregon (`us-west-2`). Em 22/09/2026 o responsável determinou ambos em São Paulo. O projeto de produção antigo, vazio, foi removido e o novo `CircuitoNE` (`ukyoyrmebwadmuzkswdw`) criado na mesma organização em `sa-east-1`, verificado `ACTIVE_HEALTHY` em 23/09/2026 UTC. Com autorização expressa para a conta humana, `SUPABASE_PROJECT_REF`, `SUPABASE_URL` e `SUPABASE_PUBLISHABLE_KEY` foram atualizados e conferidos no environment GitHub `Producao`; o App implementador segue sem acesso a variables/secrets (HTTP 403). O responsável cadastrou `SUPABASE_DB_PASSWORD` do novo banco e substituiu o token de gerenciamento por um PAT limitado ao projeto e a `Connection Pooling: Read`, válido até 22/12/2026. O [workflow manual protegido](../../.github/workflows/validate-production.yml) passou na [execução 35813985190](https://github.com/IgnisDevNE/CircuitoNE/actions/runs/35813985190): token e senha aceitos, TLS `verify-full` e consulta somente leitura. Não houve migração, seed nem deploy. Callbacks e guard de inicialização permanecem por implementar antes de conectar dados reais. O Supabase não migra região in-place. [Procedimento oficial](https://supabase.com/docs/guides/troubleshooting/change-project-region-eWJo5Z).

## Isolamento obrigatório

Dois serviços/containers de aplicação distintos, atrás do proxy HTTPS, com configuração e limites separados. Nomes propostos: `circuitone-prod` e `circuitone-dev`. Reutilizar a mesma imagem homologada por digest; configuração de ambiente no runtime SSR. Não produzir dois forks de código.

Na inicialização, validar o par ambiente/projeto: produção só aceita `ukyoyrmebwadmuzkswdw`, dev só aceita `odphoxozclrshqjgwbqk`. A referência antiga `mwgccjvztzbderlwtheg` não deve ser aceita após a troca. Configuração ausente, destino trocado ou login demo habilitado em produção impedem subir o serviço. Nenhuma chave privilegiada pode entrar em bundle, imagem ou log. Cookies de sessão são restritos ao host exato, sem `Domain=.magalz.space`; callbacks usam allowlists exatas separadas.

Durante a preparação, o responsável autorizou **login nominal temporário apenas para testes**. O login `[demo] entrar como Ana` do protótipo atende à caracterização atual. Isso não comprova identidade, não substitui RLS e não concede acesso a produção. Se o dev remoto ainda usar essa modalidade, limitar o acesso ao ambiente a testadores por controle no proxy; não publicar uma conta administrativa compartilhada na internet. O modo demo não deve usar uma chave privilegiada para contornar o Supabase Auth. Ao conectar dados persistidos, usar identidades Auth sintéticas de escopo mínimo.

## Seeds de homologação

Manter os dados do produto em `docs/migrations/`; manter seeds sintéticos de dev separados de migrações e da promoção para produção. O script de seed deve recusar qualquer projeto diferente de `odphoxozclrshqjgwbqk`, exigir ambiente dev e registrar o conjunto/versionamento aplicado. Nunca resetar o banco compartilhado; carga idempotente por IDs estáveis reservados, sem sobrescrever registros fora do conjunto sintético.

Cobrir artistas com vários projetos, serviços, audiovisual e integrantes; coletivos aprovados/pendentes/recusados/suspensos; usuários sem coletivo, administradores e membros com perfis de permissões diferentes em coletivos diferentes; perfis sem mídia e com galerias; eventos futuros/em andamento/passados/cancelados/reagendados, gratuitos/pagos e lineup interno/externo; mensagens pessoais e de coletivos com histórico de suspenso só para leitura; listas vazias e volume suficiente para paginação. O catálogo de permissões, retenção de denúncias e classificação de evento sem fim só ganham exemplos normativos após aprovação final na #66/#42/#41.

Usar nomes, imagens, contatos, documentos e conversas sintéticos. E-mails de exemplo em domínio reservado, sem enviar mensagens para endereços reais por seed. Não copiar produção para homologação. Datas são calculadas a partir de uma referência declarada para o conjunto; CI fixa essa referência. Uploads ficam em buckets de dev, com quotas, RLS e limpeza do conjunto sintético. Cenários de falha de rede/serviço usam fixtures de teste, sem corromper o ambiente compartilhado.

## Verificação e entrega

CI deve reconstruir o banco descartável, aplicar migrações e testar constraints/RLS/grants e cenários de leitura/escrita permitidos e negados. O ensaio inicial de infraestrutura não equivale a todos esses contratos de produto. Playwright deve rodar tanto caracterização offline quanto jornadas integradas conforme cada fase entregar funcionalidades.

Homologação compartilhada recebe exatamente as migrações revisadas pelo fluxo GitHub protegido, seguida de seed dev e smoke test sem reset. Produção só recebe o artefato/migrações homologados, após aprovação, sem seeds de demonstração. Testar que dev não acessa produção e que produção recusa modo demo e comandos de seed.

Relatórios/screenshots/traces de CI devem conter apenas dados sintéticos e nenhuma credencial. Não reutilizar automaticamente a captura atual em fluxos com tokens, cookies ou dados pessoais reais; revisar e sanitizar antes. Testes com dados reais não devem ser publicados em artefatos acessíveis do repositório.

## Backup e exclusão

Decisão do responsável em 22/09/2026: backup diário e eliminação dos dados de contas excluídas das cópias de segurança em até 7 dias. O prazo deve ser divulgado nos termos e na política de privacidade. A restauração ocorre em ambiente isolado, acessível apenas ao processo de saneamento; reaplicar e verificar exclusões antes de liberar consultas, jobs, integrações ou acesso operacional normal. Novo cadastro com o mesmo CPF não recupera a conta anterior. Regras canônicas e exceção para mensagens: [RN-31–34](../business-rules/mvp.md).

O plano informado é gratuito. Preparar e validar backup próprio diário, armazenamento restrito, expiração de cópias e cobertura dos arquivos em #43/F6-T4; não presumir backup diário gerenciado. O [backup de banco não inclui objetos do Storage](https://supabase.com/docs/guides/platform/backups). Meta inicial aprovada: RPO de até 24 horas e RTO de até 48 horas, sujeitos a ensaio de restauração isolada; se o ensaio não atingir a meta, revisar o método antes da liberação. Essas decisões não declaram a rotina implantada.

Antes da integração de Auth, usar serviço SMTP gerenciado com remetente do domínio `magalz.space` e permitir no dev apenas destinatários de teste controlados. O serviço SMTP padrão do Supabase restringe destinatários e não serve como entrega pública do produto. Site URLs, callbacks e remetentes continuam por configurar e verificar em cada projeto. [Limites e configuração oficial](https://supabase.com/docs/guides/auth/auth-smtp). Provedor específico, credenciais isoladas, configuração e envio de teste seguem pendentes em #43; backup de banco e cópia de objetos precisam de verificação separada.

## Dependências de implantação

[#31](https://github.com/IgnisDevNE/CircuitoNE/issues/31): identidade/credenciais/QA; [#32](https://github.com/IgnisDevNE/CircuitoNE/issues/32): migrações e homologação; [#34](https://github.com/IgnisDevNE/CircuitoNE/issues/34): validação e aceite do workflow no PR #45; [#43](https://github.com/IgnisDevNE/CircuitoNE/issues/43): DNS/HTTPS/SMTP/recuperação. SSR e containers definitivos são F0-T11/T12; schema e seeds de domínio acompanham F1–F5, com casos suficientes em dev a cada entrega. Não apontar os domínios para o protótipo inseguro como se ele já fosse produção.
