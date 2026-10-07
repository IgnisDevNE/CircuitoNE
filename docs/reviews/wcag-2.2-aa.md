# Auditoria de acessibilidade — WCAG 2.2 nível AA (W16)

Atualizado em 07/10/2026. Escopo: o app React Router (SSR) contra o Supabase local com as seeds sintéticas. Alvo: **WCAG 2.2, nível AA**.

> **Leitura honesta do resultado.** Não há nenhuma violação conhecida nas verificações automáticas e programáticas descritas abaixo, nos dois tamanhos de tela. Isso **não** é uma declaração de conformidade: ferramentas automáticas cobrem só uma parte dos critérios, e a conformidade completa exige teste humano com leitor de tela, ampliação, comando de voz e dispositivos reais. O que falta está em [Itens que exigem tecnologia assistiva](#itens-que-exigem-tecnologia-assistiva-e-teste-humano). Até esse teste, o texto correto é "sem violações conhecidas nas verificações automáticas e de teclado", e não "100% WCAG compliant".

## Escopo

| Eixo | Cobertura |
|---|---|
| Telas | Desktop 1366×900 e celular 390×844 (projetos `desktop` e `mobile` de `playwright.db.config.ts`); reflow a 320×640 (equivale a 1280 px com zoom de 400%). |
| Rotas públicas (21) | `/`, `/artistas`, perfil do artista, `/coletivos`, perfil do coletivo (aprovado e produtor), `/eventos`, evento publicado, em andamento, encerrado, cancelado, adiado e de tipo "outros", `/manifesto`, `/entrar`, `/cadastro`, 404 (rota, artista não publicado, coletivo pendente, evento em rascunho, id inválido). |
| Rotas autenticadas (34) | `/painel`, `/painel/dados`, `/painel/dados/nova-atuacao`, `/painel/perfil/:id` (artista, serviços, audiovisual e atuação não publicada), `/painel/seguranca`, `/painel/mensagens` (lista, conversa, nova), `/painel/coletivos`, `/painel/explorar/{artistas,servicos,audiovisual,coletivos}` e valor inexistente, área do coletivo (painel, solicitações, mensagens, membros, editar, perfil, evento novo, evento em rascunho, cancelado e adiado) e coletivos pendente, suspenso, recusado, encerrado e produtor. |
| Papéis e contas | Conta ativa com coletivo, integrante com perfil de acesso, candidato, conta suspensa, conta com exclusão em análise e conta sem confirmação (login recusado). |
| Estados | Formulários com erro de validação (cadastro, entrada, dados, atuação nova, perfil, segurança, exclusão de conta, evento novo), menu público e menu do painel abertos, listas vazias (artistas, explorar), `details` abertos (subestilos, denúncia, reenvio de e-mail), editor de markdown com título/lista/link e lineup, chat flutuante aberto e minimizado (página pública e catálogo do painel), tela do QR code da MFA e código recusado, etapas do cadastro (conta, celular, código, código recusado, dados, dados com erro, painel). |

## Método

1. **axe-core 4.13.0** (`@axe-core/playwright` 4.13.0, Chromium do Playwright 1.63.0) com as tags `wcag2a`, `wcag2aa`, `wcag21a`, `wcag21aa`, `wcag22aa` e `best-practice`, mais a regra experimental `label-content-name-mismatch` (2.5.3), ligada de propósito. **Nenhuma regra é desligada e nenhum elemento é excluído.** Exigência: zero violações em cada rota e estado (`tests/e2e/db/a11y.ts`).
2. **Verificações próprias no navegador** onde o axe é cego ou deixa "incompleto" (`a11y-checks.ts`, `a11y-layout.ts`): contraste de texto calculado sobre o estado renderizado (compõe fundos translúcidos pelos ancestrais; cobre o que o axe marca como "parcialmente coberto"), contorno de campos (3:1), reflow a 320 px, espaçamento de texto do critério 1.4.12, animações em andamento (nada infinito nem acima de 5 s; nada com `prefers-reduced-motion`), e uma **caminhada de Tab** que confere foco visível, elemento não coberto por conteúdo fixo e ausência de armadilha de teclado. Os detectores foram testados "ao contrário" (cor ruim e foco sem contorno são acusados).
3. **Cores de destaque** (`AccentScope`, escolhidas por artistas e coletivos): teste unitário com 4.096 cores (passos de 17 por canal) sobre os três fundos e sobre o tom de destaque, e teste e2e que injeta dez cores extremas (azul puro, quase preto, branco, neon) nos escopos das páginas e mede o contraste real.
4. **Jornadas só por teclado** (`a11y-write.spec.ts`, `a11y-states.spec.ts`): cadastro completo (conta, celular, código, dados, atuação), entrada, edição de dados, criação de evento, envio de mensagem pelo chat flutuante. Cada ação é alcançada com Tab (nada de clique nem `focus()`).
5. **Revisão do código** de todos os componentes de `src/components` e `src/pages` contra a lista de critérios abaixo.

Onde cada coisa roda: leituras em `desktop` e `mobile`; o que grava dados (MFA, cadastro, evento, mensagem, edição de dados) nos projetos serializados `a11y-write-desktop` e `a11y-write-mobile`, depois de todos os outros, desfazendo o que altera.

## Achados e correções

Quantidades por categoria, encontradas na primeira execução e corrigidas (nenhuma pendente):

| Categoria | Critério | Achados | Correção |
|---|---|---|---|
| Contorno de campos | 1.4.11 | Todos os campos de texto, selects e áreas de texto de todas as telas com formulário tinham contorno de 1,25:1. Causa raiz: `* { border-color }` fora de `@layer` vencia todo `border-[...]` do Tailwind, então bordas de erro, foco e item ativo **nunca eram aplicadas**. | Regra movida para `@layer base`; novo token `--color-control` (≥ 3,6:1) nos campos, no editor de markdown e nos seletores de cor. |
| Contraste do destaque | 1.4.3, 1.4.11 | `accentTextColor` só conferia o fundo `#050506`: sobre painéis e tons de destaque o texto chegava a 4,17:1. Botão sólido usava texto preto fixo: 3,1:1 com destaques escuros. | Texto de destaque conferido contra os três fundos e o tom de 15%; `--accent-contrast` (preto ou branco, ≥ 4,58:1) no botão sólido, que não escurece mais no hover. |
| Estrutura | 1.3.1 | `<li>` dentro de `ul role="log"` (conversa, `listitem`); `<p>` dentro de `<dl>` (3 telas do Explorar, `definition-list`); `aria-label` sem papel (`aria-prohibited-attr`, 2 telas); `header` do chat contado como segundo banner. | Log em `div` com lista dentro; mensagem vazia fora do `dl`; `role="group"`; `div` no lugar do `header`. |
| Ordem de títulos | 1.3.1, 2.4.6 | h3 logo abaixo do h1 em artistas, eventos e coletivos (`heading-order`). | `h2` oculto antes das listas (cartões seguem h3). |
| Alvo mínimo | 2.5.8 | 179 caixas de subestilo de 13×13 px. | Caixas e rádios de 1,25 rem e rótulo de 1,5 rem de altura mínima. |
| Rótulo no nome | 2.5.3 | Botões H1/H2 do editor ("Título"), glifos `[x]` de fechar menu e conversa. | Nomes com o texto visível ("H1 (título)"); glifo `[✕]`. |
| Uso da cor | 1.4.1 | Link "entrar" do cadastro, "por <coletivo>" e links do lineup só sublinhavam no hover; filtros ativos e etapa atual se distinguiam só pela cor. | Links sublinhados; filtro ativo em negrito e sublinhado; etapa atual em negrito. |
| Movimento | 2.2.2 | Cursor piscando, tremor do CRT e feixe de varredura rodavam sem parar. | Cursor pisca 4 vezes, tremor roda uma vez, feixe uma passada de 4 s; `prefers-reduced-motion` continua desligando tudo. |
| Reflow | 1.4.10 | Título "$ coletivos_e_produtoras" passava 19 px da tela a 320 px. | `overflow-wrap: anywhere` nos títulos. |
| Espaçamento de texto | 1.4.12 | Títulos de conversa, nomes de membros, de pedidos, do usuário e da barra do chat truncavam (`truncate`). | Nomes quebram linha; resumos de uma linha ficam marcados como resumo (`data-teaser`). |
| Foco | 2.4.7, 2.4.11 | Campos de data e hora do navegador não mostravam o anel de foco; com a janela do chat aberta (desktop), o link "Enviar mensagem" de um cartão do Explorar ficava coberto por ela. | Anel em `:focus-within` nesses campos; `scroll-padding-bottom` e `padding-bottom` do tamanho da janela enquanto aberta; `scroll-padding-top` para o cabeçalho fixo. |
| Mensagens de estado | 4.1.3 | Mudanças no lineup (adicionar, remover) sem aviso falado. | Região `aria-live` com a contagem. |
| Erro ligado ao campo | 3.3.1 | Rádios de "tipo de atuação" com `aria-invalid` sem `aria-describedby`. | `aria-describedby` apontando para a mensagem. |
| Propósito do campo | 1.3.5 | Estado sem `autocomplete`. | `address-level1`. |
| Propósito do link | 2.4.4 | Dois links "abrir" no painel. | "abrir meus coletivos" / "abrir mensagens" (texto oculto no fim). |
| Ruído para leitor de tela | 1.3.1 | Prompt decorativo do rodapé lido em voz alta; totais da página inicial só no registro animado (oculto). | Prompt `aria-hidden`; totais em texto para leitor de tela; placeholder do editor sem "acima". |

Cobertura de regressão: o teste unitário `accent-contrast.test.ts` ganhou a grade de 4.096 cores; `a11y*.spec.ts` rodam no CI (job `e2e`).

## Critério por critério (WCAG 2.2, A e AA)

Status: **Atende** (com evidência verificada), **N/A** (não se aplica) ou **AT** (requer verificação manual com tecnologia assistiva). A 4.1.1 foi removida na 2.2 (obsoleta) e não consta.

| Critério | Nível | Status | Evidência e observação |
|---|---|---|---|
| 1.1.1 Conteúdo não textual | A | AT | Toda imagem tem `alt` (`quality.spec.ts`; axe `image-alt`); decorativas com `aria-hidden`; QR code da MFA com alternativa (chave em texto). A qualidade dos textos ("Foto de {nome}", "Capa do evento {nome}") e imagens de usuário com texto embutido precisam de revisão humana. |
| 1.2.1–1.2.5 Mídia temporal | A/AA | N/A | O site não tem áudio nem vídeo. |
| 1.3.1 Informações e relações | A | AT | axe (listas, `dl`, títulos, rótulos, landmarks) sem violações; campos com `label`, grupos em `fieldset`/`legend`. A ordem de leitura real em leitor de tela ainda precisa ser ouvida. |
| 1.3.2 Sequência significativa | A | Atende | Ordem do DOM = ordem visual; caminhada de Tab (`a11y-checks.spec.ts`). |
| 1.3.3 Características sensoriais | A | Atende | Instruções não dependem de posição, cor ou forma (QR code tem a chave; "barra de formatação" no lugar de "botões acima"). |
| 1.3.4 Orientação | AA | Atende | Sem trava de orientação; layout responsivo (390 e 320 px). |
| 1.3.5 Identificar a finalidade da entrada | AA | Atende | `autocomplete` em e-mail, senha atual/nova, nome, nascimento, telefone, UF, cidade, código de uso único; axe `autocomplete-valid`. |
| 1.4.1 Uso da cor | A | Atende | Links sublinhados; erros têm texto "[erro]"; filtros e etapa ativos com negrito/sublinhado; navegação ativa com barra; axe `link-in-text-block`. |
| 1.4.2 Controle de áudio | A | N/A | Sem áudio. |
| 1.4.3 Contraste (mínimo) | AA | Atende | axe `color-contrast` + varredura própria em todas as rotas (inclui o que o axe deixa incompleto) + 10 cores de destaque + grade unitária de 4.096 cores. |
| 1.4.4 Redimensionar texto | AA | Atende | Unidades relativas; sem `maximum-scale`; reflow a 320 px é mais exigente que 200%. |
| 1.4.5 Imagens de texto | AA | AT | Logotipo e títulos são texto. Capas e fotos enviadas por usuários podem conter texto: conteúdo editorial. |
| 1.4.10 Reflow | AA | Atende | 320×640 sem rolagem horizontal em todas as rotas (`a11y-checks.spec.ts`). |
| 1.4.11 Contraste de não texto | AA | Atende | Contorno de campos ≥ 3:1 (varredura própria); foco branco sobre fundo escuro; destaque ≥ 3:1 sobre os fundos (teste unitário). Caixas e rádios usam o desenho nativo com `accent-color`. |
| 1.4.12 Espaçamento de texto | AA | Atende | Estilo do critério aplicado em todas as rotas: nada novo é cortado nem passa da largura. Ressalva: resumos de uma linha ou clamp de 2–3 linhas nos cartões (bio, última mensagem) são truncados por design em qualquer espaçamento; o texto completo está a um clique. |
| 1.4.13 Conteúdo em hover ou foco | AA | N/A | Não há conteúdo que só aparece em hover/foco; só `title` nativo (controlado pelo navegador). |
| 2.1.1 Teclado | A | Atende | Jornadas só por teclado (cadastro, entrar, evento, dados, chat) e caminhada de Tab em 15 rotas. |
| 2.1.2 Sem armadilha de teclado | A | Atende | Caminhada de Tab com o chat aberto e minimizado; Esc fecha menus e minimiza o chat. |
| 2.1.4 Atalhos de teclado | A | N/A | Só Esc e Enter dentro de componentes em foco; sem atalho de caractere global. |
| 2.2.1 Tempo ajustável | A | N/A | Sem limite de tempo de conteúdo. O código de SMS expira por segurança (exceção essencial). |
| 2.2.2 Pausar, parar, ocultar | A | Atende | Nenhuma animação passa de 5 s (`a11y-checks.spec.ts`). O recarregamento da conversa a cada ~15 s é parte de uma atividade de chat (exceção essencial) e há botão "atualizar". |
| 2.3.1 Três flashes | A | Atende | Nenhum flash; a oscilação do CRT é de opacidade 0,85–1 e roda uma vez. |
| 2.4.1 Ignorar blocos | A | Atende | "Pular para o conteúdo" no layout público e no painel (`quality.spec.ts`); landmarks `header`, `nav`, `main`, `footer`. |
| 2.4.2 Página com título | A | Atende | `quality.spec.ts` (título único por rota). |
| 2.4.3 Ordem do foco | A | AT | Caminhada de Tab sem saltos; o foco vai ao título ao navegar (`RouteA11y`) e ao primeiro campo inválido. A experiência real com leitor de tela precisa ser ouvida. |
| 2.4.4 Finalidade do link (em contexto) | A | Atende | Links com texto próprio; repetições ("Enviar mensagem" nos cartões do Explorar) têm o nome da pessoa no mesmo item de lista. |
| 2.4.5 Várias maneiras | AA | Atende | Menu principal, listas com busca e filtros, destaques na página inicial, menu do painel. |
| 2.4.6 Títulos e rótulos | AA | Atende | Títulos descritivos; ordem de títulos (`heading-order`); rótulos visíveis em todo campo. |
| 2.4.7 Foco visível | AA | Atende | Contorno branco de 2 px em todo foco, inclusive campos de data/hora; conferido a cada parada de Tab. |
| 2.4.11 Foco não obscurecido (mínimo) | AA | Atende | Caminhada de Tab com o chat aberto e minimizado e cabeçalhos fixos; a janela é não modal e se fecha com Esc. |
| 2.5.1 Gestos de ponteiro | A | N/A | Só clique/toque simples. |
| 2.5.2 Cancelamento de ponteiro | A | Atende | Ações no `click` (evento "up"); sem `mousedown` que dispare ação. |
| 2.5.3 Rótulo no nome | A | AT | axe `label-content-name-mismatch` sem violações. Comando de voz (Voice Control, Dragon) precisa ser testado. |
| 2.5.4 Atuação por movimento | A | N/A | Nenhum recurso usa o movimento do aparelho. |
| 2.5.7 Movimentos de arrasto | AA | N/A | Nenhum arrastar; a ordem da galeria usa botões. |
| 2.5.8 Tamanho do alvo (mínimo) | AA | Atende | axe `target-size` sem violações em todas as rotas e estados; caixas e rádios de 1,25 rem. Links dentro de texto são isentos. |
| 3.1.1 Idioma da página | A | Atende | `lang="pt-BR"` (`quality.spec.ts`). |
| 3.1.2 Idioma de partes | AA | Atende | Não há trechos em outro idioma; termos como "line-up", "presskit", "booking" são vernáculo da cena. Nomes próprios dos usuários não se marcam. |
| 3.2.1 Em foco | A | Atende | Nenhuma mudança de contexto ao receber foco. |
| 3.2.2 Em entrada | A | Atende | Filtros e listas dependentes atualizam o conteúdo na mesma página, com contagem em `role="status"`; envio só por botão. |
| 3.2.3 Navegação consistente | AA | Atende | Navegação em layouts compartilhados (`PublicLayout`, `AppShell`, `CollectiveLayout`). |
| 3.2.4 Identificação consistente | AA | Atende | Mesmos componentes e rótulos para a mesma função. |
| 3.2.6 Ajuda consistente | A | N/A | Não há mecanismo de ajuda repetido nas páginas; o e-mail de suporte aparece apenas na tela de conta restrita e no pedido de correção de CPF, cada um uma vez. Se um canal de ajuda passar a existir no rodapé, ele precisa ficar na mesma posição relativa. |
| 3.3.1 Identificação de erro | A | AT | Erro em texto, ligado ao campo (`aria-invalid`, `aria-describedby`), foco no primeiro inválido (`a11y-states.spec.ts`). O anúncio no leitor de tela precisa ser ouvido. |
| 3.3.2 Rótulos ou instruções | A | Atende | Rótulos e dicas ("de 8 a 72 caracteres", "com DDD"); obrigatórios marcados com `*` e texto oculto. |
| 3.3.3 Sugestão de erro | AA | Atende | Mensagens dizem o que corrigir (ex.: "Informe um e-mail válido."). |
| 3.3.4 Prevenção de erros (legais, financeiros, dados) | AA | Atende | Exclusão de conta e de atuação, encerramento do coletivo e cancelamento de evento exigem confirmação digitada ou segundo passo; transferência de propriedade exige MFA. |
| 3.3.7 Entrada redundante | A | Atende | O e-mail e o celular confirmados aparecem como texto e não são pedidos de novo nas etapas seguintes (`a11y-write.spec.ts`); a confirmação de senha é exceção prevista. |
| 3.3.8 Autenticação acessível (mínimo) | AA | Atende | Entrar com e-mail e senha: sem teste cognitivo, colar e gerenciador de senhas liberados (`a11y-states.spec.ts`); código de SMS e de TOTP com `autocomplete="one-time-code"` e colar liberado. |
| 4.1.2 Nome, função, valor | A | AT | axe (`aria-*`, `button-name`, `label`, `role`) sem violações; botões de alternância com `aria-pressed`/`aria-expanded`; janela do chat com `role="dialog"` e `aria-modal="false"`. Combinações com leitores de tela precisam ser ouvidas. |
| 4.1.3 Mensagens de status | AA | AT | Sucessos em `role="status"`, erros em `role="alert"`, contagens de filtro em `role="status"`, lineup em região `aria-live`, conversa em `role="log"`. Regiões inseridas já com conteúdo podem não ser anunciadas por todos os leitores. |

## Itens que exigem tecnologia assistiva e teste humano

1. **Leitores de tela** (NVDA + Firefox e Chrome, JAWS, VoiceOver no macOS e no iOS, TalkBack): ouvir as jornadas principais (entrar, cadastro, criar evento, enviar mensagem, editar perfil). Em especial: se as mensagens de sucesso (`role="status"`) inseridas junto com o conteúdo são anunciadas; se o erro de campo é lido ao receber o foco; como o chat flutuante (diálogo não modal, `role="log"` com `aria-live`) é navegado e se o retorno do foco ao botão de origem faz sentido; o teclado e o leitor nos botões de filtro e na lista de estilos com subestilos.
2. **Comando de voz** (Voice Control, Dragon): confirmar o critério 2.5.3 nos botões com glifo ([≡], [✕], H1, H2).
3. **Modo de alto contraste do Windows** (`forced-colors`): o contorno neon usa `box-shadow`, que some nesse modo; conferir a legibilidade das bordas e do foco.
4. **Ampliação e baixa visão**: 200% e 400% de zoom em Chrome e Firefox, e ampliador de tela, além do teste automático a 320 px.
5. **Dispositivos reais**: toque, teclado virtual cobrindo o campo, orientação paisagem.
6. **Conteúdo de usuário**: textos alternativos genéricos de fotos ("Foto de {nome}"), capas e galerias com texto embutido, títulos do markdown dos eventos (h1→h3, h2→h4 dentro do painel "descrição", que já é h2).
7. **Revisão editorial** de linguagem simples nas mensagens de erro e nos textos de ajuda.

## Como reproduzir

```sh
pnpm exec supabase start && # seeds como no job e2e de ci.yml
pnpm test:e2e:db            # a11y.spec, a11y-checks.spec, a11y-states.spec (desktop e mobile) e a11y-write.spec (a11y-write-*)
pnpm test:unit              # accent-contrast.test.ts
```

Arquivos: `tests/e2e/db/a11y.ts` (axe e rotas), `a11y-checks.ts` e `a11y-layout.ts` (contraste, reflow, espaçamento, foco), `a11y.spec.ts`, `a11y-checks.spec.ts`, `a11y-states.spec.ts`, `a11y-write.spec.ts`. Cada rodada de `a11y-write.spec.ts` cria duas contas de cadastro (uma por tamanho de tela) e consome dois dos oito celulares de teste de `supabase/config.toml`; o `register.spec.ts` consome um. Numa base reaproveitada os celulares usados são pulados; se acabarem, `supabase db reset` e as seeds repõem.
