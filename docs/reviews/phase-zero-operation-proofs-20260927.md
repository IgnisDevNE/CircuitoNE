# Provas operacionais restantes da fase zero

Responsáveis: implementação prepara os ensaios; QA e mantenedor revisam; mantenedor aprova operações protegidas. Este checkpoint resolve a preparação das provas, não fecha #31, #32 ou #43.

- **#31 é bloqueio de entrada da execução hospedada:** integrar os helpers/workflows e revisar antes de revogar permissões temporárias. Não habilitar `HOMOLOGATION_DB_WRITE_ENABLED` até o isolamento estar comprovado.
- **#32, imagem:** o CI constrói a revisão anterior e a candidata, fixa os IDs e confere seus SHAs de origem. Em containers próprios, sem portas/volumes/rede externa ou credenciais, valida SSR, promove os mesmos bytes, injeta indisponibilidade e recupera a imagem anterior. Artefato/SHA divergente é recusado antes de mutar o destino; falha ao iniciar a candidata também recupera a anterior. Falha de limpeza reprova o ensaio. O artefato guarda apenas IDs/SHAs e resultado; o destino de produção não participa.
- **#43, Storage:** homologação protegida prepara o objeto sintético descrito em [backup.md](../engineering/backup.md). Em seguida, backup e drill devem provar receipt externo, hashes, grants/RLS e acesso do titular no conteúdo restaurado. Os testes locais não substituem essa execução.

TDD local: o teste de integração falhou pela ausência da preparação de Storage; a negativa de owner incorreto falhou antes da consulta explícita; lançamento mal sucedido falhou antes de abranger o start pelo rollback. Correções mantiveram os testes verdes. SQL/RLS foi exercitado em PostgreSQL Supabase descartável no Podman, incluindo idempotência e recusa de política adulterada. A evidência nativa de promoção/rollback deve ser vinculada ao CI do SHA final, após revisão Sol/low.

O ensaio integrado com Auth e Storage reais também passou no Podman: upload pela sessão do titular, leitura privada, negação a outro usuário/visitante e limpeza completa das sessões/MFA. O teste reproduziu o retorno HTTP 400 com código interno 404 do bucket ausente; somente essa resposta específica permite criá-lo, sem tratar erros arbitrários como ausência.

Produção continua na página de espera, sem migrações, cadastros novos, dados reais ou backup legível. A cifra de banco e objetos é o último gate técnico pré-release da #104, fora da fase zero.
