# ADR 0010 — Backup sem cifra no cliente somente antes de dados reais

Data: 24/09/2026; ordem de entrega confirmada em 26/09/2026. Estado: aprovado. A [#104](https://github.com/IgnisDevNE/CircuitoNE/issues/104) é o **último gate técnico pré-release**, fora do aceite da fase zero.

## Contexto e decisão

O plano previa criptografar cada backup antes do R2, mantendo a chave privada fora do alcance dos agentes. A chave criada até agora tem sua parte privada neste mesmo Windows, portanto não satisfaz esse isolamento. O responsável decidiu **não usar criptografia no cliente por enquanto** e ativá-la antes de lançar a aplicação.

Em 26/09/2026, confirmou que “criptografia de banco” neste adiamento significa cifrar os **backups de banco e objetos do Storage antes do upload**. Não altera TLS nem a proteção do banco ativo. Depois das demais entregas pré-release, concluir geração externa da chave, cifragem, restauração isolada, teste de falha fechada sem cifra, ativação do backup de produção e revisão de segurança. Só depois autorizar lançamento e entrada de dados reais; um piloto também conta como dados reais.

Até lá, a rotina sem cifra exporta **somente o projeto de homologação com dados sintéticos**. Não há job de backup de produção sem criptografia, mesmo que o projeto esteja vazio. Os buckets R2 continuam privados, separados por ambiente e acessíveis por credenciais restritas. A cópia é transmitida por TLS, mas alguém com acesso ao bucket pode ler seu conteúdo: isso é uma limitação aceita apenas durante a preparação. A rotina nunca publica o arquivo no repositório nem em artefatos do CI.

Antes de admitir dados reais, [#104](https://github.com/IgnisDevNE/CircuitoNE/issues/104) exige um novo par criado fora deste host, cifragem antes do upload e restauração isolada comprovada. A chave privada atual não será reaproveitada. O gate de lançamento não pode ser satisfeito apenas com bucket privado ou chave pública local.

## Consequências

A execução inicial valida exportação, cópia de objetos, integridade, limites e rotação com dados sintéticos. A [#43](https://github.com/IgnisDevNE/CircuitoNE/issues/43) conserva o ensaio de restauração e a operação diária; a [#104](https://github.com/IgnisDevNE/CircuitoNE/issues/104) bloqueia dados reais e lançamento. Se algum dado real surgir antes disso, interromper a rotina legível, restringir o acesso e tratar a exposição antes de prosseguir.
