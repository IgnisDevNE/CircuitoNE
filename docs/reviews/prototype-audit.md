# Revisão do protótipo

Base de código inicial: `3d860df`. Revisão estática orientada pelo grafo Memtrace e inspeção de trechos das jornadas. A navegação foi amostrada em build local; não é certificação completa de todas as combinações, acessibilidade ou segurança.

## Diagnóstico

**Não recomendo reescrita completa.** O projeto tem componentes reutilizáveis, tipos discriminados de atuação, páginas separadas e dependências enxutas. TypeScript estrito e build passam. O problema principal é a distância entre mock e comportamento real, com riscos concentrados em permissões, validações, estado e conteúdo. O Memtrace apontou cadastro (`Register`, complexidade estimada 79), criação de evento (26) e edição de coletivo (17) como áreas prioritárias; métricas são indicadores, não um veredito automático.

Uma fase de preparação (F0) reduz risco antes de ligar banco. Preservar o visual, componentes básicos e fluxos válidos. A migração do roteador foi aprovada para atender SSR; não dividir arquivos apenas pelo tamanho nem instalar store global por preferência. As referências abaixo seguem a revisão 2 do plano; os achados continuam descrevendo o protótipo inspecionado.

## Achados acionáveis

| ID / prioridade | Evidência e consequência | Tratamento |
|---|---|---|
| UI-01 / P1 | `Markdown.tsx:7–11,36`: URLs entram por substituição de string em atributo HTML sem escapar aspas; `dangerouslySetInnerHTML` recebe resultado. Há caminho de injeção de atributos e risco de XSS quando conteúdo vier de usuários. Não foi executado payload ativo. | F0-T7; teste de conteúdo malicioso antes da correção; renderizar nós React seguros ou usar biblioteca/sanitização mantida. |
| UI-02 / P1 | `useColetivo` em `CollectiveLayout.tsx:7–12` converte ausência de vínculo em nível 0. Dashboard não distingue visitante autenticado de membro. | F0-T9 e F3-T2; negar ausência de vínculo, reforçar no servidor. |
| UI-03 / P1 | `Messages.tsx:9–12`, `Dashboard.tsx:18`, `AppShell` usam todas as threads; `CollectiveMessages.tsx:15–23` guarda ID inicial e busca conversa em coleção global. Restrições do menu não impedem vazamento. | F0-T9/F5; filtrar pela identidade e cargo atuais, testar troca de coletivo e revogação. |
| UI-04 / P1 | `StoreContext.tsx:45,61,74–88`: login demo, autor fixo e mutações sem autorização. Esperado no mock, incompatível com dados reais. Aprovação usa menor cargo existente e pode conceder N2 se não houver N0. | F1/F3/F5; remover dados privados do bundle e aplicar RLS/RPC. |
| UI-05 / P1 | `Register.tsx:120–130`: cadastro ignora os dados e autentica Ana; criar coletivo/solicitar apenas mostra toast. `EditProfile.tsx:37` também só mostra sucesso. | F1/F2/F3; sucesso somente depois de confirmação persistida; falhas recuperáveis. |
| UI-06 / P1 | `EditMembers.tsx:18–24`, `EditCollective.tsx:34–37`: remove/rebaixa último administrador sem garantia de outro N2. | F3-T2; regra transacional e teste concorrente. |
| UI-07 / P2 | `maskCache` em `utils.ts:54–62` interpreta valor já formatado com separador de milhar como decimal. Ex.: `R$ 1.500,00` vira `R$ 1,50` ao formatar novamente. | F0-T8; teste de idempotência e formato regional; centavos no banco. |
| UI-08 / P2 | `CreateEvent.tsx:45–62` não compara fim/início, transforma fim vazio em início e converte horário pelo fuso do navegador. | F0-T8/F4; fuso e invariantes explícitos; não reproduzir fim fictício. |
| UI-09 / P2 | `Register.tsx:50–79` verifica presença de CPF/e-mail, não validade; a escolha do tipo só é validada na etapa 3, embora apareça na 1. | F0/F1; validação por etapa e no servidor, sem confiar na máscara. |
| UI-10 / P2 | `AppShell.tsx:31–34`, `EditData.tsx:54`, `EditProfile.tsx:29`: só artistas têm acesso à edição; serviços/audiovisual não têm manutenção profissional apesar do brief. | F2-T1; separar “perfil público” de “editar dados profissionais”. |
| UI-11 / P2 | `Register.tsx:102–103,292`: foto hardcoded e galeria vazia; `ImageField` em `form.tsx:166–170` converte qualquer arquivo selecionado em data URL, sem limites/rejeição real. | F2-T3; Storage, validação de tipo/tamanho e recuperação de erro. |
| UI-12 / P2 | `EditProfile.tsx:18`, `EditCollective.tsx:24`, `CollectiveMessages.tsx:15`: estado inicial baseado no ID pode ficar antigo ao trocar rota sem remontar. | F0; testes com dois IDs e atualização concorrente. |
| UI-13 / P2 | `Security.tsx:18–32`: e-mail muda no objeto local; senha nunca é verificada/trocada. Login não tem recuperação; cadastro não define senha/confirmação. | F1-T2/T3/T4. |
| UI-14 / P2 | Dashboard pessoal só usa eventos dos coletivos em `Dashboard.tsx:14–16`; artista pode ter evento no lineup de outro organizador. | Resolver a composição desejada e testar em F4-T3. |
| UI-15 / P2 | A criação de mensagens não existe; a central só oferece conversas seed. Coletivo com várias conversas não tem seletor na tela atual. | F5-T1; definir iniciação/destinatário e seleção. |
| UI-16 / P2 | `.figma/make/site.json` contém descrição de gestão documental, `noindex` e metadados genéricos. HTML depende do plugin e a aplicação define título em runtime. | F6-T3; revisar idioma efetivo, metadata social, SEO, fallback e deep links. `lang` observado no navegador era pt-BR; não afirmar que está errado em runtime. |
| UI-17 / P2 | `EventPage.tsx:72–74` coloca botão dentro de link; hierarquia de headings da Home repete h1; estados de erro e teclado exigem auditoria. | F0-T10/F6-T3; semântica e interação manual, não só screenshot. |
| UI-18 / P2 | Datas de seed relativas ao momento de carregamento tornam capturas/testes variáveis; listas sem paginação e mock global mascaram erros de rede. | Relógio/data fixa em testes; loading/erro/vazio/403/404/conflito e dados por consulta. |

Todos esses pontos descrevem o protótipo, não incidentes de produção. Não há backend de negócio ligado. As prioridades indicam o risco **antes de conectar dados reais**.

## Inventário de janelas (27 rotas)

| Área / rotas | O que existe | O que falta para aceite |
|---|---|---|
| Home `/` | Vitrine de artistas e agenda | Conteúdo final, metadados, hierarquia, estados vazios e carregamento. |
| Artistas `/artistas`, `/artistas/:id` | Busca/filtro, perfil, estilos, mídias/eventos | Paginação, upload/galeria completa, perfil indisponível e privacidade da API. |
| Coletivos `/coletivos`, `/coletivos/:id` | Listagem, perfil e membros | Descoberta/paginação, política de publicação e vínculo do projeto artístico certo. |
| Eventos `/eventos`, `/eventos/:id` | Agenda futura, descrição, lineup, ingresso externo | Em andamento/cancelado/reagendado, conteúdo seguro, fuso, link inválido e rascunho. |
| Login `/entrar` | Credenciais visuais + demo | Autenticação, recuperação, confirmação, expiração, bloqueio e erro. |
| Cadastro `/cadastro` | Wizard quatro tipos | Senha/confirmar e-mail, CPF válido/único, data válida, uploads, salvamento, retomar falha parcial. |
| Painel `/painel` | Eventos dos coletivos e mensagens seed | Escopo correto por usuário; evento de artista externo; loading/erro e primeira utilização. |
| Perfil `/painel/perfil/:atuacaoId` | Formulário de artista | Persistência, todos os campos, foto/galeria/redes e editor profissional dos outros tipos. |
| Conta `/painel/dados`, `/painel/dados/nova-atuacao` | Dados gerais e adição de atuação | Dados profissionais completos, política de CPF, consistência entre listas e perfil público, evitar perda de formulário. |
| Segurança `/painel/seguranca` | Formulários de e-mail e senha | Auth real, confirmação, reautenticação, recuperar acesso, sessões e exclusão da conta. |
| Central `/painel/mensagens` | Histórico/chat mock | Iniciar conversa, autorização por participante, leitura individual, paginação, envio/erro/retry. |
| Meus coletivos `/painel/coletivos` | Lista e modal de solicitação | Envio real, estado pendente/recusado, cancelar pedido, entrada/saída e feedback. |
| Explorar `/painel/explorar/{artistas,servicos,audiovisual,coletivos}` | Quatro diretórios para N2 | Filtros/paginação, política antisscraping e acesso profissional real por RLS. |
| Coletivo `/coletivo/:id/painel` | Eventos/membros/não lidas | Negar não membro, estado inexistente e escopo correto. |
| Coletivo `/coletivo/:id/mensagens` | Uma conversa inicial | Lista de conversas, acesso atual, leitura individual, troca de contexto. |
| Coletivo `/coletivo/:id/solicitacoes` | Aprovar/recusar mock | Atomicidade, histórico, duplicatas, cargo N0 e concorrência. |
| Coletivo `/coletivo/:id/eventos/novo` | Formulário de evento | Validação completa, publicar/rascunho/editar/cancelar e erro de upload. |
| Coletivo `/coletivo/:id/membros` | Alterar cargo/remover | Último N2, confirmar remoção, revogação imediata e conflito simultâneo. |
| Coletivo `/coletivo/:id/editar` | Dados + adicionar cargos | Renomear/retirar cargo sem órfãos, validação e conflitos. |
| Coletivo `/coletivo/:id/perfil` | Bio/imagem/cor/Instagram/site | Restante das redes, validação, upload, sucesso persistido. |

## Verificação realizada e limites

- Build e TypeScript do baseline passaram; auditoria completa depois encontrou dependências de desenvolvimento vulneráveis. Atualização de Vite 8.0.5 → 8.3.0 e transitivas resultou em auditoria sem vulnerabilidades conhecidas na preparação.
- Navegação amostrada: Home, login demo, painel, navegação lateral, meus coletivos, dashboard N2 e criação de evento. Formulário vazio/mal preenchido apresenta erros de obrigatoriedade.
- Em viewport 390 px, a página de criação de evento não apresentou overflow horizontal pelo tamanho do documento (`scrollWidth=clientWidth=390`). Isso não substitui teste de teclado, zoom 400%, leitor de tela, contraste completo ou axe.
- A sessão em memória é perdida ao recarregar, como esperado. O servidor dev observou recargas frequentes; a inspeção continuou no build estático estável, sem atribuir a causa ao produto sem investigação.
- Ainda falta executar todas as jornadas dos quatro tipos, todos os cargos/estados, revisão visual completa móvel e testes automatizados de acessibilidade. Estão no backlog; não são declarados aprovados.

## O que reaproveitar

**Lacuna adicional confirmada na revisão:** o responsável definiu aprovação de novos coletivos pela administração do site antes de liberar dashboard e funções (RN-30). Faltam tela de acompanhamento, fila administrativa, aprovação/recusa e papel operacional separado de N2. Essas novas janelas não estão entre as 27 rotas existentes e fazem parte de F3-T1/T5.

Componentes de formulário, painéis, toasts, estilos e páginas públicas são uma base útil. O roteador atual tem somente 133 linhas; testar suas necessidades antes de substituí-lo. O StoreContext é um mock, não uma arquitetura de backend a expandir. Migração incremental deve retirar um domínio por vez do estado global, evitando dois lugares editáveis para a mesma informação.
