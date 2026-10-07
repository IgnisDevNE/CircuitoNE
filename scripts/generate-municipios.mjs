#!/usr/bin/env node
/**
 * Regenera o conjunto fixo de municípios brasileiros a partir da API de localidades do IBGE:
 *   https://servicodados.ibge.gov.br/api/v1/localidades/municipios
 * Escreve `src/data/municipios.json` (nomes por UF, ordenados em pt-BR) e `supabase/migrations/<versão>_municipalities.sql`
 * (tabela `public.municipalities` e chaves estrangeiras compostas). Fonte consultada em 07/10/2026: 5.571 municípios
 * (os 5.570 de antes de 2025, mais Boa Esperança do Norte/MT). Rodar de novo só para atualizar o JSON; a migração já
 * aplicada nunca é reescrita (uma mudança futura da lista vira nova migração).
 *
 * Uso: node scripts/generate-municipios.mjs [arquivo-ibge.json]   (sem argumento, consulta a API)
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const SOURCE = 'https://servicodados.ibge.gov.br/api/v1/localidades/municipios'
const root = (path) => fileURLToPath(new URL(`../${path}`, import.meta.url))
const MIGRATION = 'supabase/migrations/20261011100000_municipalities.sql'
const UFS = ['AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO']

const raw = process.argv[2] ? JSON.parse(readFileSync(process.argv[2], 'utf8')) : await (await fetch(SOURCE)).json()
const uf = (item) => item.microrregiao?.mesorregiao?.UF?.sigla ?? item['regiao-imediata']?.['regiao-intermediaria']?.UF?.sigla
const rows = raw
  .map((item) => ({ code: item.id, name: item.nome.normalize('NFC').trim(), state: uf(item) }))
  .sort((a, b) => a.state.localeCompare(b.state) || a.name.localeCompare(b.name, 'pt-BR') || a.code - b.code)

const seen = new Set()
for (const row of rows) {
  const key = `${row.state}|${row.name}`
  if (!UFS.includes(row.state) || seen.has(key) || !Number.isInteger(row.code)) throw new Error(`Registro inválido do IBGE: ${key}`)
  seen.add(key)
}

const byState = Object.fromEntries(UFS.map((state) => [state, rows.filter((row) => row.state === state).map((row) => row.name)]))
writeFileSync(root('src/data/municipios.json'), `${JSON.stringify(byState)}\n`)

const quote = (value) => `'${value.replaceAll("'", "''")}'`
const values = [...rows].sort((a, b) => a.code - b.code).map((row) => `(${row.code},${quote(row.name)},'${row.state}')`)
const sql = `-- Municípios brasileiros (dados públicos de referência): ${rows.length} registros da API de localidades do IBGE
-- (${SOURCE}, consultada em 07/10/2026). Gerada por scripts/generate-municipios.mjs; não editar à mão.
-- Cidade e UF passam a ser valores fixos: toda tabela que guarda o par (state_code, city) referencia esta.
create table public.municipalities (
  ibge_code integer primary key check (ibge_code between 1100000 and 5399999),
  name text not null check (length(btrim(name)) between 1 and 150),
  state_code text not null check (state_code = any(array['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'])),
  unique (state_code, name)
);
alter table public.municipalities enable row level security;
create policy municipalities_read on public.municipalities for select to anon, authenticated using (true);
revoke all on public.municipalities from public, anon, authenticated, service_role;
grant select on public.municipalities to anon, authenticated;

insert into public.municipalities(ibge_code, name, state_code) values
${values.join(',\n')};

-- Dados já gravados com a grafia livre: reaproveita o nome oficial quando só a caixa ou os espaços diferem.
-- O que ainda não casar derruba a migração nas chaves abaixo (a lista fixa é o que o produto exige).
update private.account_details t set city = m.name from public.municipalities m
  where m.state_code = t.state_code and lower(btrim(t.city)) = lower(m.name) and t.city <> m.name;
update public.profiles t set city = m.name from public.municipalities m
  where m.state_code = t.state_code and lower(btrim(t.city)) = lower(m.name) and t.city <> m.name;
update public.collectives t set city = m.name from public.municipalities m
  where m.state_code = t.state_code and lower(btrim(t.city)) = lower(m.name) and t.city <> m.name;
update public.events t set city = m.name from public.municipalities m
  where m.state_code = t.state_code and lower(btrim(t.city)) = lower(m.name) and t.city <> m.name;

alter table private.account_details add constraint account_details_municipality_fk
  foreign key (state_code, city) references public.municipalities(state_code, name);
alter table public.profiles add constraint profiles_municipality_fk
  foreign key (state_code, city) references public.municipalities(state_code, name);
alter table public.collectives add constraint collectives_municipality_fk
  foreign key (state_code, city) references public.municipalities(state_code, name);
alter table public.events add constraint events_municipality_fk
  foreign key (state_code, city) references public.municipalities(state_code, name);
`
writeFileSync(root(MIGRATION), sql)
console.log(`${rows.length} municípios; ${MIGRATION} e src/data/municipios.json escritos`)
