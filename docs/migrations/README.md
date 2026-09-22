# Migrações

Nenhum SQL de negócio foi criado ou aplicado na preparação. Este é o diretório canônico solicitado pelo AGENTS.md.

O Supabase CLI procura `supabase/migrations`, portanto a fase 0 deve validar um adaptador simples: gerar uma árvore temporária de trabalho contendo `supabase/config.toml` e cópia somente de execução dos SQL de `docs/migrations/`. Essa árvore não é versionada nem editada manualmente. O CLI recebe `--workdir` apontando para ela. Não presumir que o CLI lê `docs/migrations/` diretamente.

Antes da primeira migração: instalar versão fixa do CLI; conferir `--help` e os comandos disponíveis; gerar o nome via `supabase migration new`; guardar o SQL final aqui; testar reconstrução em banco local descartável e aplicar no `CircuitoNE-dev` pelo GitHub. A configuração e o adaptador precisam de teste antes de serem usados com segredos.

Cada migração deve incluir constraints, índices, grants, RLS, políticas e revogações necessárias. Acrescentar testes positivos e negativos e atualizar os tipos gerados. Após aplicada em ambiente compartilhado, não editar migração antiga: criar outra.

Promoção usa exatamente os mesmos bytes/ordem validados, registrados por checksum e SHA. Nunca resetar homologação compartilhada ou produção em CI. Mudanças destrutivas exigem plano de dados, ensaio de restauração e janela; preferir expandir → migrar dados → contrair. Rollback de frontend não equivale a rollback de banco.
