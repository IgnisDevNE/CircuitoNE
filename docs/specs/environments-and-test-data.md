# Ambientes, domínios e dados de teste

Data: 22/09/2026. **Requisitos confirmados pelo responsável; implantação e integração pendentes.** Complementa a [arquitetura do MVP](architecture-mvp.md). Não declara DNS, containers SSR ou Auth já operacionais.

| Ambiente | Endereço aprovado | Banco | Dados e autenticação |
|---|---|---|---|
| Produção | `https://circuitone.magalz.space` | `CircuitoNE` (`mwgccjvztzbderlwtheg`) | Dados reais somente após homologação; Supabase Auth, sem login demo/seed de teste |
| Dev/homologação | `https://circuitone-dev.magalz.space` | `CircuitoNE-dev` (`odphoxozclrshqjgwbqk`) | Muitos cenários sintéticos persistidos; contas de teste identificadas e Supabase Auth ao integrar |
| Testes de PR | Runner descartável sem domínio público | Supabase local descartável | Migrações, fixtures e Playwright sem credenciais de ambientes compartilhados |

## Isolamento obrigatório

Dois serviços/containers de aplicação distintos, atrás do proxy HTTPS, com configuração e limites separados. Nomes propostos: `circuitone-prod` e `circuitone-dev`. Reutilizar a mesma imagem homologada por digest; configuração de ambiente no runtime SSR. Não produzir dois forks de código.

Na inicialização, validar o par ambiente/projeto: produção só aceita a referência de produção; dev só aceita a referência de homologação. Configuração ausente, destino trocado ou login demo habilitado em produção impedem subir o serviço. Nenhuma chave privilegiada pode entrar em bundle, imagem ou log. Cookies de sessão são restritos ao host exato, sem `Domain=.magalz.space`; callbacks usam allowlists exatas separadas.

Durante a preparação, o responsável autorizou **login nominal temporário apenas para testes**. O login `[demo] entrar como Ana` do protótipo atende à caracterização atual. Isso não comprova identidade, não substitui RLS e não concede acesso a produção. Se o dev remoto ainda usar essa modalidade, limitar o acesso ao ambiente a testadores por controle no proxy; não publicar uma conta administrativa compartilhada na internet. O modo demo não deve usar uma chave privilegiada para contornar o Supabase Auth. Ao conectar dados persistidos, usar identidades Auth sintéticas de escopo mínimo.

## Seeds de homologação

Manter os dados do produto em `docs/migrations/`; manter seeds sintéticos de dev separados de migrações e da promoção para produção. O script de seed deve recusar qualquer projeto diferente de `odphoxozclrshqjgwbqk`, exigir ambiente dev e registrar o conjunto/versionamento aplicado. Nunca resetar o banco compartilhado; carga idempotente por IDs estáveis reservados, sem sobrescrever registros fora do conjunto sintético.

Cobrir artistas com vários projetos, serviços, audiovisual e integrantes; coletivos aprovados/pendentes/recusados; usuários sem coletivo e níveis 0/1/2 em coletivos diferentes; perfis sem mídia e com galerias; eventos futuros/passados/gratuitos/pagos e lineup interno/externo; mensagens pessoais e de coletivos; listas vazias e volume suficiente para paginação. Suspensão, retenção, idade, término/fuso e moderação só ganham exemplos normativos após as decisões pendentes serem aprovadas.

Usar nomes, imagens, contatos, documentos e conversas sintéticos. E-mails de exemplo em domínio reservado, sem enviar mensagens para endereços reais por seed. Não copiar produção para homologação. Datas são calculadas a partir de uma referência declarada para o conjunto; CI fixa essa referência. Uploads ficam em buckets de dev, com quotas, RLS e limpeza do conjunto sintético. Cenários de falha de rede/serviço usam fixtures de teste, sem corromper o ambiente compartilhado.

## Verificação e entrega

CI deve reconstruir o banco descartável, aplicar migrações e testar constraints/RLS/grants e cenários de leitura/escrita permitidos e negados. O ensaio inicial de infraestrutura não equivale a todos esses contratos de produto. Playwright deve rodar tanto caracterização offline quanto jornadas integradas conforme cada fase entregar funcionalidades.

Homologação compartilhada recebe exatamente as migrações revisadas pelo fluxo GitHub protegido, seguida de seed dev e smoke test sem reset. Produção só recebe o artefato/migrações homologados, após aprovação, sem seeds de demonstração. Testar que dev não acessa produção e que produção recusa modo demo e comandos de seed.

Relatórios/screenshots/traces de CI devem conter apenas dados sintéticos e nenhuma credencial. Não reutilizar automaticamente a captura atual em fluxos com tokens, cookies ou dados pessoais reais; revisar e sanitizar antes. Testes com dados reais não devem ser publicados em artefatos acessíveis do repositório.

## Dependências de implantação

[#31](https://github.com/IgnisDevNE/CircuitoNE/issues/31): identidade/credenciais/QA; [#32](https://github.com/IgnisDevNE/CircuitoNE/issues/32): migrações e homologação; [#34](https://github.com/IgnisDevNE/CircuitoNE/issues/34): validação e aceite do workflow no PR #45; [#43](https://github.com/IgnisDevNE/CircuitoNE/issues/43): DNS/HTTPS/SMTP/recuperação. SSR e containers definitivos são F0-T11/T12; schema e seeds de domínio acompanham F1–F5, com casos suficientes em dev a cada entrega. Não apontar os domínios para o protótipo inseguro como se ele já fosse produção.
