# CircuitoNE

Hub da cena eletrônica do Nordeste. Artistas, coletivos e produtoras se encontram, divulgam eventos e conversam entre si num só lugar.

**Versão 1.0** (prova de conceito completa). Todas as telas estão ligadas ao banco real. O ambiente de desenvolvimento roda com dados sintéticos, e a produção ainda serve só a página de espera.

## O que o app faz

**Para o público (sem conta)**
- **Página inicial:** artistas, coletivos e eventos em destaque.
- **`/artistas`:** filtros por estado do Nordeste, por estilo musical e busca por nome. O perfil público tem foto, galeria, estilos, cidade e os eventos de que o artista participa.
- **`/eventos`:** eventos em andamento e próximos. A página de cada evento mostra data, local, lineup, ingresso e descrição em markdown.
- **`/coletivos`:** filtro por estado e perfil público de cada coletivo e produtora.
- **Manifesto.**

**Para quem tem conta**
- **Cadastro real:** confirmação de e-mail e de celular por SMS, CPF e localização por UF e cidade a partir da lista oficial do IBGE.
- **Atuações:** quatro tipos (Artista, Serviços, Audiovisual e Integrante de Coletivo). Cada uma tem dados profissionais, fotos, PDFs privados (presskit e lista de serviços) e publicação opcional do perfil de artista.
- **Coletivos e produtoras:**
  - criar um coletivo e pedir para entrar num existente;
  - aprovar ou recusar pedidos de entrada;
  - perfis de acesso com permissões e gestão de membros;
  - transferência de propriedade;
  - perfil público com imagem e cor.
- **Eventos do coletivo:** criação, lineup com artistas do hub ou nomes livres, capa, publicação e cancelamento.
- **Mensagens:** central com todas as conversas da conta, como atuação ou como coletivo, mais uma janela flutuante de "Enviar mensagem" que abre sem sair da página.
  - O envio é instantâneo. Se falhar, aparece "mensagem não enviada" com as opções "tentar de novo" e "descartar".
  - Também há não lidas, bloqueio e denúncia.
- **Catálogo interno:** artistas, serviços, audiovisual e coletivos. Os dados profissionais aparecem só para quem tem permissão.
- **Painel:**
  - resumo da conta, próximos eventos e coletivos;
  - os próximos eventos abrem num painel lateral, sem sair da página;
  - troca de e-mail e de senha;
  - verificação em duas etapas (TOTP);
  - pedido de exclusão da conta.

## Ambientes

| Ambiente | Endereço | Conteúdo |
|---|---|---|
| Dev (PoC) | `https://circuitone-dev.magalz.space`, atrás do Cloudflare Access | App completo contra o Supabase `CircuitoNE-dev`, com dados sintéticos |
| Roteiro de testes (UAT) | `https://uat.magalz.space` | Checklist para quem testa o dev pela primeira vez |
| Produção | `https://circuitone.magalz.space` | Página de espera |

O pod Podman `circuitone` roda no PC e serve o app, a página de espera e o roteiro. O acesso externo passa pelo Cloudflare Tunnel. Detalhes em [docs/engineering/environment.md](docs/engineering/environment.md).

**Só no dev:** a verificação em duas etapas não é exigida (as telas avisam que será em produção) e coletivos novos já nascem aprovados. O controle é a tabela `private.environment_flags`, preenchida apenas pelo seed do dev.

## Tecnologia

- React Router 8 (framework, SSR), React 19, Vite 8 e Tailwind CSS 4.
- Supabase: Postgres, Auth, Storage, RLS, RPCs `security definer` e a Edge Function de SMS via AWS SNS.
- Node 24.21.0 e pnpm 10.34.3 (`.mise.toml`).
- **Testes:**
  - Vitest para unidade;
  - Playwright com axe para ponta a ponta e WCAG 2.2 AA;
  - testes SQL contra o Supabase local.
- **CI no GitHub Actions:** `quality`, `database`, `e2e` e CodeQL. A cobertura é publicada no Codecov.

## Como rodar

```sh
pnpm install --frozen-lockfile
cp .env.example .env.local   # preencher SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY e APP_ORIGIN
pnpm dev                     # servidor de desenvolvimento
pnpm check                   # testes de infra e unidade, typecheck e build
```

O app só sobe com um Supabase configurado, seja o dev hospedado ou o local, e não há dados de demonstração no código. Para as suítes com banco (`pnpm test:database` e `pnpm test:e2e:db`) e o passo a passo do Supabase local no Windows com Podman, veja o [guia de ambiente](docs/engineering/environment.md).

Para atualizar o dev no PC, rode `./deploy/dev.ps1`. Ele reconstrói as imagens e recria o pod. Depois de um merge com mudanças em `supabase/**`, o workflow `db-dev.yml` aplica as migrações e os seeds sozinho.

## Segurança e acessibilidade

- **Autorização no banco:**
  - RLS em todas as tabelas e escritas só por RPCs que conferem a identidade;
  - o app usa somente a chave publicável do Supabase, nunca a chave de serviço;
  - imagens servidas pelo próprio app (`/img/*`), que lê o Storage com a identidade de quem pede, de modo que conteúdo não publicado não fica acessível.
- **Proteções do app:**
  - checagem de origem em todas as mutações;
  - CSP com nonce por requisição e cabeçalhos de segurança;
  - cookies `HttpOnly`, `Secure` e `SameSite`.
- **Revisões:**
  - [OWASP Top 10](docs/reviews/owasp-top10-2026-10.md), sem achados críticos ou altos;
  - [WCAG 2.2 AA](docs/reviews/wcag-2.2-aa.md), com axe em todas as rotas e estados, sem violações conhecidas nas verificações automáticas.

## Documentação

- [Plano e status das tarefas](docs/plan.md), incluindo o checklist antes de dados reais
- [Ambiente, pod e banco](docs/engineering/environment.md)
- [Arquitetura](docs/specs/architecture-mvp.md) e [modelo de dados](docs/architecture/backend-and-data.md)
- [Regras de negócio](docs/business-rules/mvp.md)
- [Decisões (ADRs)](docs/decisions/)
- [Instruções para agentes e colaboradores](AGENTS.md)

## Depois da 1.0

Pendências abertas como issues no GitHub:
- recuperação de senha;
- SEO das páginas públicas;
- limpeza de arquivos órfãos no Storage;
- teste humano com tecnologia assistiva;
- cotas por conta;
- CPF criptografado.

Antes de colocar a produção com dados reais, siga o checklist em [docs/plan.md](docs/plan.md):
- remover as flags de dev;
- configurar `allowedActionOrigins` de produção;
- adicionar CAPTCHA;
- criar o esquema no Supabase de produção.
