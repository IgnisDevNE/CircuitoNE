# Regras do MVP

Registro inicial: 21/09/2026, America/Fortaleza. Fontes: brief em `src/imports/pasted_text/hub-cultural-projeto.md`, interface/código do protótipo e respostas do responsável nesta tarefa.

**Confirmada** = brief coerente com protótipo ou confirmação explícita. **Observada** = comportamento do mock, sujeito a validação. **Proposta** = regra necessária sugerida, ainda não decisão de produto. Falhas do mock não viram regra.

## Conta, atuação e privacidade

| ID | Regra | Estado / evidência |
|---|---|---|
| RN-01 | Uma conta representa uma pessoa; o primeiro cadastro escolhe exatamente uma atuação: artista, serviços, audiovisual ou integrante. | Confirmada; brief, `Register.tsx:160`. |
| RN-02 | A mesma pessoa pode adicionar atuações posteriormente, inclusive vários projetos artísticos. Menus devem somar as capacidades disponíveis. | Confirmada; brief, `EditData.tsx:46`, `AppShell.tsx:26`. |
| RN-03 | CPF e nascimento são obrigatórios. CPF normalizado deve ser único entre contas, independentemente da formatação. | Confirmada pelo responsável nesta tarefa. CPF não é público. Unicidade não comprova titularidade. |
| RN-04 | Dados gerais incluem nome, e-mail, gênero, nascimento, CPF, cidade e estado. O protótipo oferece os nove estados do Nordeste. | Confirmada quanto aos campos; gênero obrigatório, idade mínima e residência fora da região ainda não decididos. |
| RN-05 | Redes pessoais: Instagram, Bandcamp, SoundCloud, Facebook, site e YouTube. | Confirmada; brief e `Register.tsx:177`. Definir herança versus edição por atuação. |
| RN-06 | Apenas artista tem perfil profissional público individual; serviços, audiovisual e integrante não têm página pública individual no MVP. | Confirmada; não significa que seus dados profissionais sejam impossíveis de editar. |
| RN-07 | Contatos, presskit e cachê são consultáveis somente por administradores de coletivos/produtoras aprovados pela administração do site, além do próprio titular para manutenção. | Confirmada pelo responsável nesta tarefa; substitui o trecho do brief que permitia todo usuário cadastrado. |
| RN-08 | Um administrador de coletivo não ganha acesso a CPF, nascimento, e-mail de autenticação, senha ou conversas privadas de terceiros. | Proposta de controle obrigatória para implementar RN-07 com escopo limitado. |

O CPF deve ter validação de dígitos e restrição `UNIQUE` no servidor; não apenas máscara na tela. Duas solicitações simultâneas com o mesmo CPF não podem criar duas contas completas. Erros não devem expor nome/e-mail do titular de um CPF existente. Nascimento deve ser uma data válida e não futura. Não se assume idade mínima sem decisão.

## Perfis

| ID | Regra | Estado / evidência |
|---|---|---|
| RN-09 | Artista mantém nome artístico, bio, estilos, foto principal, galeria, cor e redes; cada projeto é independente. | Confirmada pelo brief; galeria/upload e edição completa ainda faltam. |
| RN-10 | Dados profissionais de artista: e-mail booking, e-mail contato, presskit, média de cachê e CNPJ opcional. Booking pode repetir contato. | Confirmada; `Register.tsx:207`. Cachê não participa de cobrança na plataforma. |
| RN-11 | Serviços: estrutura, som, luzes, performances ou outros; nome/empresa, contato e portfólio. | Confirmada; `Register.tsx:223`. Texto de “outros” ainda não existe. |
| RN-12 | Audiovisual: fotografia, vídeo, audiovisual completo ou som; nome/estúdio, contato e portfólio. | Confirmada; `Register.tsx:234`. |
| RN-13 | Vitrine de artistas permite busca por nome/bio e filtro por estilo; mostra eventos associados pelo lineup. | Observada; `ArtistsHub.tsx:11`. Três estilos fixos no cadastro são uma lista de teste, não taxonomia final. |

## Coletivos e permissões

| ID | Regra | Estado / evidência |
|---|---|---|
| RN-14 | Uma pessoa pode participar de vários coletivos/produtoras. Solicitar acesso não concede participação automaticamente. | Confirmada; brief, `MyCollectives.tsx:19`, `PendingRequests.tsx:16`. |
| RN-15 | Pode-se criar coletivo/produtora ou solicitar entrada em existente. Criador é apresentado como administrador na interface. | Confirmada no fluxo; `Register.tsx:254`. O mock não conclui a criação. |
| RN-16 | Coletivo tem nome, cidade/UF, atuação, tipo, bio, imagem, cor, redes e CNPJ opcional. Produtora exige CNPJ. | Confirmada; brief e `EditCollective.tsx:36`. CNPJ é texto e deve aceitar formatos numérico e alfanumérico. |
| RN-17 | Cargos são customizados por coletivo, com nível 0 (membro), 1 (comunicação), 2 (administrador). | Confirmada; `types.ts:74`. Cargo de A não pode ser atribuído a membro de B. |
| RN-18 | Nível 0 consulta dashboard; nível 1 também lê/responde mensagens do coletivo; nível 2 gerencia membros, solicitações, cargos, dados, perfil e eventos. | Confirmada; brief, `CollectiveLayout.tsx:23`. Visitante não equivale a membro nível 0. |
| RN-19 | Administrador aprova/recusa solicitações, muda cargo e remove membro. | Confirmada; `PendingRequests.tsx:20`, `EditMembers.tsx:18`. |
| RN-20 | Perfil público mostra membros; o nome vira link apenas quando há perfil artístico associado. | Confirmada; brief e `CollectiveProfile.tsx:11`. Escolha do projeto quando há vários está pendente. |
| RN-21 | Ao aprovar entrada, atribuir cargo básico de nível 0; impedir remoção/rebaixamento do último administrador, inclusive em concorrência. | Proposta. Mock usa o menor nível disponível, que pode ser administrador; essa falha não será reproduzida. |
| RN-22 | Dashboard do coletivo ordena futuros por proximidade e passados por último; mostra cargo, última atividade e mensagens conforme permissão. | Confirmada; brief. Mock ordena passados do mais recente para o mais antigo; confirmar esse detalhe. |
| RN-30 | Coletivos/produtoras criados ficam pendentes de verificação/aprovação pela administração do site. Dashboard e demais funções internas só são liberados após aprovação; criar o coletivo não libera o diretório profissional. | Confirmada pelo responsável nesta tarefa. Falta no protótipo. |

RN-30 se aplica também ao criador N2. Ser administrador de um coletivo pendente não libera funções de um aprovado. Proposta de UX: o criador vê uma tela de acompanhamento do pedido, com pendência/recusa e orientação de correção. Administração do site é uma função operacional distinta de N2; não atribui acesso automático a CPF ou mensagens pessoais. Motivo de recusa, reapresentação e suspensão posterior precisam de critérios operacionais na fase 3.

## Eventos e mensagens

| ID | Regra | Estado / evidência |
|---|---|---|
| RN-23 | Evento pertence a um coletivo e só administrador desse coletivo o cria/gerencia. | Confirmada; `CreateEvent.tsx:30`. |
| RN-24 | Evento contém nome, tipo, descrição Markdown, início/fim, UF/cidade/local, lineup, ingresso/gratuito e capa. “Outros” exige descrição do tipo. | Confirmada; brief e `CreateEvent.tsx:45`. Obrigatoriedade do fim diverge entre brief e UI. |
| RN-25 | Lineup aceita artista do hub ou nome livre; somente artista vinculado tem link. | Confirmada; `CreateEvent.tsx:32`, `EventPage.tsx:79`. |
| RN-26 | Entrada é gratuita ou tem link externo de ingresso. Não há venda, pagamento ou comissão internos especificados. | Confirmada; brief e `CreateEvent.tsx:61`. Validar somente URLs HTTP(S). |
| RN-27 | Agenda pública lista futuros; página de evento exibe capa, detalhes, descrição e lineup. | Confirmada; `EventsList.tsx:9`. Definir como tratar evento em andamento, cancelado e reagendado. |
| RN-28 | Há central pessoal de mensagens e mensagens dos coletivos, com contador de não lidas. | Confirmada; brief. Mensagens pessoais só entre participantes; coletivo só por membros atuais N1/N2. |
| RN-29 | Leitura é individual por usuário e conversa; enviar deve ter autoria derivada da sessão, data do servidor e idempotência. | Proposta de integridade; o mock tem contador global e autor fixo. |

## Decisões em aberto e momento de resolução

Meta: resolver as decisões na **F0-T15**, antes de iniciar os contratos dependentes. A última coluna indica o limite que permanece bloqueado se a decisão atrasar. As issues vinculadas exigem aprovação explícita; a criação delas não ratifica propostas.

| Decisão | Proposta inicial | Resolver antes de |
|---|---|---|
| [D-01 Aprovação de coletivos](https://github.com/IgnisDevNE/CircuitoNE/issues/40) | **Resolvida:** administração do site verifica/aprova antes de liberar dashboard e funções internas (RN-30). Critérios de verificação, recusa/reapresentação e suspensão ainda devem ser definidos, sem presumir KYC. | Fase 3. |
| [D-02 Idade mínima e tratamento de menores](https://github.com/IgnisDevNE/CircuitoNE/issues/38) | Definir público, política de privacidade e responsáveis; não inferir 18 anos. | Fase 1, abertura do cadastro. |
| [D-03 Recuperação de conta com CPF já usado; edição de CPF; exclusão e novo cadastro](https://github.com/IgnisDevNE/CircuitoNE/issues/38) | CPF não editável livremente; recuperação autenticada; retenção a definir. | Fase 1. |
| [D-04 Fim do evento e fuso](https://github.com/IgnisDevNE/CircuitoNE/issues/41) | Fim opcional como `NULL`; se preenchido, maior que início; fuso explícito America/Fortaleza. | Fase 4. |
| [D-05 Publicação e cancelamento](https://github.com/IgnisDevNE/CircuitoNE/issues/41) | Estados rascunho/publicado/cancelado; cancelamento preserva página e aviso. | Fase 4. |
| [D-06 Quem inicia conversa, destinatário e representação do coletivo](https://github.com/IgnisDevNE/CircuitoNE/issues/42) | Usuário autenticado inicia contato permitido; remetente pessoal ou representante explícito. | Fase 5. |
| [D-07 Moderação e bloqueio](https://github.com/IgnisDevNE/CircuitoNE/issues/42) | Canal de denúncia e fluxo de suspensão antes do beta público; operação manual inicial. | Fase 5/6. |
| [D-08 Galeria, cotas e tipos de arquivo](https://github.com/IgnisDevNE/CircuitoNE/issues/39) | Imagens JPG/PNG/WebP até 5 MB; presskit por URL no MVP; confirmar limites. | Fase 2. |
| [D-09 Permissão de diretório para administrador sem e-mail confirmado ou coletivo suspenso](https://github.com/IgnisDevNE/CircuitoNE/issues/40) | Negar; checar estado atual no banco. | Fase 3. |
| [D-10 Dados sociais pessoais versus projeto](https://github.com/IgnisDevNE/CircuitoNE/issues/39) | Cada atuação mantém seus links; dados pessoais privados não são publicados por herança implícita. | Fase 2. |

Mudança de regra exige atualizar este documento, os critérios de aceite e os testes por revisão separada. Não resolver divergência enfraquecendo teste existente.
