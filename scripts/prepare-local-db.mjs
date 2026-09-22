import { createHash } from 'node:crypto'
import { lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex')

// Prepara arquivos somente. Não inicia CLI, não lê credenciais e não conecta a banco.
export function prepareLocalDatabase(root = repo) {
  for (const path of ['docs', 'docs/migrations', 'supabase', 'supabase/config.toml']) {
    if (lstatSync(join(root, path)).isSymbolicLink()) throw new Error(`Link não permitido: ${path}`)
  }
  const source = join(root, 'docs/migrations')
  const versions = new Set()
  const migrations = readdirSync(source, { withFileTypes: true })
    .filter(entry => entry.name.toLowerCase().endsWith('.sql'))
    .sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0)
    .map(entry => {
      if (!entry.isFile() || !/^\d{14}_[a-z][a-z0-9_]*\.sql$/.test(entry.name)) {
        throw new Error(`Migração com nome inválido ou link: ${entry.name}`)
      }
      const version = entry.name.slice(0, 14)
      if (versions.has(version)) throw new Error(`Migração com versão duplicada: ${version}`)
      versions.add(version)
      return { file: entry.name, bytes: readFileSync(join(source, entry.name)) }
    })
  const config = readFileSync(join(root, 'supabase/config.toml'))
  const temp = join(resolve(root), 'temp')
  mkdirSync(temp, { recursive: true })
  if (lstatSync(temp).isSymbolicLink()) throw new Error('Link não permitido: temp')
  const workdir = mkdtempSync(join(temp, 'supabase-run-'))
  mkdirSync(join(workdir, 'supabase/migrations'), { recursive: true })
  writeFileSync(join(workdir, 'supabase/config.toml'), config, { flag: 'wx' })
  for (const { file, bytes } of migrations) {
    writeFileSync(join(workdir, 'supabase/migrations', file), bytes, { flag: 'wx' })
  }
  writeFileSync(join(workdir, 'manifest.json'), JSON.stringify({
    configSha256: sha256(config),
    migrations: migrations.map(({ file, bytes }) => ({ file, sha256: sha256(bytes) })),
  }, null, 2) + '\n', { flag: 'wx' })
  return workdir
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.length !== 2) {
    console.error('O preparo local não aceita argumentos nem destinos remotos.')
    process.exitCode = 1
  } else {
    console.log(prepareLocalDatabase())
  }
}
