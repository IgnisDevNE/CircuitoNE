import { createHash } from "node:crypto"

import {
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs"

import { dirname, join, resolve } from "node:path"

import { fileURLToPath } from "node:url"

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "..")

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex")

export const homologationInputs = [
  "supabase/seeds/identity.sql",
  "supabase/seeds/collectives.sql",
  "supabase/seeds/events.sql",

  "supabase/seeds/messages.sql",
  "tests/database/default-grants.sql",
  "tests/database/homologation-smoke.sql",
]

// Prepara arquivos somente. Não inicia CLI, não lê credenciais e não conecta a banco.

export function prepareLocalDatabase(root = repo) {
  for (const path of [
    "docs",
    "docs/migrations",
    "supabase",
    "supabase/config.toml",
  ]) {
    if (lstatSync(join(root, path)).isSymbolicLink())
      throw new Error(`Link não permitido: ${path}`)
  }

  const source = join(root, "docs/migrations")

  const versions = new Set()

  const migrations = readdirSync(source, { withFileTypes: true })

    .filter((entry) => entry.name.toLowerCase().endsWith(".sql"))

    .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))

    .map((entry) => {
      if (
        !entry.isFile() ||
        !/^\d{14}_[a-z][a-z0-9_]*\.sql$/.test(entry.name)
      ) {
        throw new Error(`Migração com nome inválido ou link: ${entry.name}`)
      }

      const version = entry.name.slice(0, 14)

      if (versions.has(version))
        throw new Error(`Migração com versão duplicada: ${version}`)

      versions.add(version)

      return { file: entry.name, bytes: readFileSync(join(source, entry.name)) }
    })

  const config = readFileSync(join(root, "supabase/config.toml"))

  const temp = join(resolve(root), "temp")

  mkdirSync(temp, { recursive: true })

  if (lstatSync(temp).isSymbolicLink())
    throw new Error("Link não permitido: temp")

  const workdir = mkdtempSync(join(temp, "supabase-run-"))

  mkdirSync(join(workdir, "supabase/migrations"), { recursive: true })

  writeFileSync(join(workdir, "supabase/config.toml"), config, { flag: "wx" })

  for (const { file, bytes } of migrations) {
    writeFileSync(join(workdir, "supabase/migrations", file), bytes, {
      flag: "wx",
    })
  }

  writeFileSync(
    join(workdir, "manifest.json"),
    JSON.stringify(
      {
        configSha256: sha256(config),

        migrations: migrations.map(({ file, bytes }) => ({
          file,
          sha256: sha256(bytes),
        })),
      },
      null,
      2,
    ) + "\n",
    { flag: "wx" },
  )

  return workdir
}

export function prepareHomologation(
  root = repo,
  sourceSha = process.env.GITHUB_SHA,
) {
  if (!/^[a-f0-9]{40}$/.test(sourceSha ?? ""))
    throw new Error("SHA de homologação inválido")

  const inputs = homologationInputs

  for (const path of ["supabase/seeds", "tests", "tests/database", ...inputs]) {
    if (lstatSync(join(root, path)).isSymbolicLink())
      throw new Error(`Link não permitido: ${path}`)
  }

  const bytes = inputs.map((file) => ({
    file,
    bytes: readFileSync(join(root, file)),
  }))

  const workdir = prepareLocalDatabase(root)

  for (const input of bytes) {
    mkdirSync(dirname(join(workdir, input.file)), { recursive: true })

    writeFileSync(join(workdir, input.file), input.bytes, { flag: "wx" })
  }

  const manifestFile = join(workdir, "manifest.json")

  const manifest = JSON.parse(readFileSync(manifestFile, "utf8"))

  writeFileSync(
    manifestFile,
    JSON.stringify(
      {
        ...manifest,
        sourceSha,
        projectRef: "odphoxozclrshqjgwbqk",

        seedReference: "2026-09-26T12:00:00.000Z",
        inputs: bytes.map((input) => ({
          file: input.file,
          sha256: sha256(input.bytes),
        })),
      },
      null,
      2,
    ) + "\n",
  )

  return workdir
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  if (process.argv.length === 3 && process.argv[2] === "--homologation") {
    console.log(prepareHomologation())
  } else if (process.argv.length !== 2) {
    console.error("O preparo local não aceita argumentos nem destinos remotos.")

    process.exitCode = 1
  } else {
    console.log(prepareLocalDatabase())
  }
}
