// Imagens de demonstração do dev: arte gerada (sem fotos de terceiros) para artistas e coletivos das contas demo.
// Roda no CI (`.github/workflows/demo-images.yml`): entra como cada conta `demo-*@example.invalid` com a chave publicável e a
// senha das contas sintéticas (FIXTURE_PASSWORD), envia PNGs ao bucket `public-images` com a sessão do dono e anexa pelas
// mesmas RPCs da interface. Idempotente: o que já tem imagem é pulado. Nunca registra senha nem token.
import { resolve } from "node:path"
import { fileURLToPath } from "node:url"

export const DEMO_SLUGS = ["marina", "rafael", "helena", "tiago", "joana", "davi", "luana", "caio", "beatriz", "otavio"]
const PALETTE = ["#ff2040", "#00e5ff", "#b388ff", "#ffd400", "#39ff14", "#ff6ec7"]

function hash(text) {
  let h = 2166136261
  for (const char of text) h = Math.imul(h ^ char.codePointAt(0), 16777619)
  return h >>> 0
}

function random(seed) {
  let state = hash(seed)
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = Math.imul(state ^ (state >>> 15), 1 | state)
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const escape = (text) => text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)

export const initials = (name) =>
  name
    .split(/[\s—-]+/)
    .filter((word) => /[\p{L}\p{N}]/u.test(word))
    .slice(0, 2)
    .map((word) => [...word][0].toUpperCase())
    .join("")

/** Arte determinística no visual do site: gradiente neon, grade, barras de "waveform", iniciais e nome. */
export function artSvg({ seed, name, color, width, height, variant = 0 }) {
  const rnd = random(`${seed}:${variant}`)
  const accent = /^#[0-9a-f]{6}$/i.test(color ?? "") ? color : PALETTE[hash(seed) % PALETTE.length]
  const second = PALETTE[(hash(seed) + 1 + variant) % PALETTE.length]
  const bars = 48
  const barWidth = width / bars
  const waveform = Array.from({ length: bars }, (_, i) => {
    const h = (0.15 + rnd() * 0.55) * height * (0.6 + 0.4 * Math.sin((i / bars) * Math.PI))
    return `<rect x="${(i * barWidth + barWidth * 0.2).toFixed(1)}" y="${(height - h).toFixed(1)}" width="${(barWidth * 0.6).toFixed(1)}" height="${h.toFixed(1)}" fill="${accent}" opacity="${(0.25 + rnd() * 0.5).toFixed(2)}"/>`
  }).join("")
  const grid = Array.from({ length: 12 }, (_, i) => {
    const y = ((i + 1) * height) / 13
    return `<line x1="0" y1="${y.toFixed(1)}" x2="${width}" y2="${y.toFixed(1)}" stroke="${second}" stroke-opacity="0.08"/>`
  }).join("")
  const size = Math.min(width, height)
  const angle = Math.round(rnd() * 360)
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
<defs>
<linearGradient id="bg" gradientTransform="rotate(${angle} .5 .5)"><stop offset="0" stop-color="${accent}" stop-opacity="0.55"/><stop offset="0.55" stop-color="#0c1220"/><stop offset="1" stop-color="${second}" stop-opacity="0.35"/></linearGradient>
<radialGradient id="glow" cx="${(0.3 + rnd() * 0.4).toFixed(2)}" cy="${(0.3 + rnd() * 0.3).toFixed(2)}" r="0.6"><stop offset="0" stop-color="${accent}" stop-opacity="0.45"/><stop offset="1" stop-color="${accent}" stop-opacity="0"/></radialGradient>
</defs>
<rect width="100%" height="100%" fill="#0c1220"/><rect width="100%" height="100%" fill="url(#bg)"/><rect width="100%" height="100%" fill="url(#glow)"/>
${grid}${waveform}
<text x="${size * 0.06}" y="${size * 0.11}" font-family="monospace" font-size="${size * 0.05}" fill="${accent}">◢◤</text>
<text x="50%" y="${(height * 0.47).toFixed(1)}" text-anchor="middle" dominant-baseline="middle" font-family="monospace" font-weight="700" font-size="${(size * 0.32).toFixed(1)}" fill="#f7f3eb" opacity="0.92">${escape(initials(name))}</text>
<text x="${size * 0.06}" y="${(height - size * 0.07).toFixed(1)}" font-family="monospace" font-size="${(size * 0.045).toFixed(1)}" fill="#f7f3eb">$ ${escape(name.toLowerCase())}</text>
</svg>`
}

/** Caminho no bucket: `<id da entidade>/<nome>.png`, como exigem as colunas e as RPCs. */
export const objectPath = (id, name) => `${id}/${name}.png`

async function main() {
  const { createClient } = await import("@supabase/supabase-js")
  const { chromium } = await import("@playwright/test")
  const { SUPABASE_URL: url, SUPABASE_PUBLISHABLE_KEY: key, FIXTURE_PASSWORD: password } = process.env
  if (!url || !key?.startsWith("sb_publishable_") || !password) throw new Error("SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY e FIXTURE_PASSWORD são obrigatórios")

  const browser = await chromium.launch()
  const page = await browser.newPage()
  const render = async (options) => {
    await page.setViewportSize({ width: options.width, height: options.height })
    await page.setContent(`<!doctype html><html><body style="margin:0">${artSvg(options)}</body></html>`)
    return page.screenshot({ type: "png" })
  }
  const stats = { uploaded: 0, skipped: 0, failed: 0 }

  async function put(client, path, png) {
    const { error } = await client.storage.from("public-images").upload(path, png, { contentType: "image/png", upsert: false })
    // Uma execução anterior interrompida pode ter enviado o arquivo sem anexar: segue para a RPC.
    if (error && !/exist|duplicate/i.test(error.message)) throw new Error(`upload: ${error.message}`)
  }

  try {
    for (const slug of DEMO_SLUGS) {
      const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
      const { error: loginError } = await client.auth.signInWithPassword({ email: `demo-${slug}@example.invalid`, password })
      if (loginError) {
        console.error(`demo-${slug}: login recusado (${loginError.code ?? loginError.status})`)
        stats.failed++
        continue
      }
      try {
        const { data: profiles, error: profilesError } = await client.rpc("list_my_profiles")
        if (profilesError) throw new Error(`list_my_profiles: ${profilesError.message}`)
        for (const profile of profiles.filter((row) => row.kind === "artist")) {
          const { data: detail, error } = await client.rpc("get_my_profile", { target: profile.id })
          if (error) throw new Error(`get_my_profile: ${error.message}`)
          if ((detail?.images ?? []).length > 0) {
            stats.skipped++
            continue
          }
          const color = detail?.profile?.color ?? detail?.color
          const shots = [
            { slot: "main", file: "demo-foto", width: 1200, height: 1200, variant: 0 },
            { slot: "gallery", file: "demo-galeria-1", width: 1600, height: 1000, variant: 1 },
            { slot: "gallery", file: "demo-galeria-2", width: 1600, height: 1000, variant: 2 },
          ]
          for (const shot of shots) {
            const path = objectPath(profile.id, shot.file)
            await put(client, path, await render({ seed: profile.id, name: profile.name, color, ...shot }))
            const alt = shot.slot === "main" ? `Arte gráfica de ${profile.name}` : `Arte gráfica de ${profile.name}, variação ${shot.variant}`
            const { error: attachError } = await client.rpc("attach_profile_image", { target: profile.id, slot: shot.slot, object_path: path, alt })
            if (attachError) throw new Error(`attach_profile_image: ${attachError.message}`)
            stats.uploaded++
          }
        }
        const { data: collectives, error: collectivesError } = await client.rpc("list_my_collectives")
        if (collectivesError) throw new Error(`list_my_collectives: ${collectivesError.message}`)
        for (const collective of collectives.filter((row) => row.is_owner)) {
          const { data: row, error } = await client.from("collectives").select("id,image_path,color").eq("id", collective.id).maybeSingle()
          if (error) throw new Error(`collectives: ${error.message}`)
          if (row?.image_path) {
            stats.skipped++
            continue
          }
          const path = objectPath(collective.id, "demo-capa")
          await put(client, path, await render({ seed: collective.id, name: collective.name, color: row?.color, width: 1600, height: 900 }))
          const { error: setError } = await client.rpc("set_collective_image", { target: collective.id, object_path: path })
          if (setError) throw new Error(`set_collective_image: ${setError.message}`)
          stats.uploaded++
        }
      } catch (error) {
        console.error(`demo-${slug}: ${error.message}`)
        stats.failed++
      } finally {
        await client.auth.signOut({ scope: "local" })
      }
    }
  } finally {
    await browser.close()
  }

  const summary = `Imagens enviadas: ${stats.uploaded} · já existentes (puladas): ${stats.skipped} · contas com falha: ${stats.failed}`
  console.log(summary)
  if (process.env.GITHUB_STEP_SUMMARY) {
    const { appendFileSync } = await import("node:fs")
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, `### Imagens de demonstração\n\n${summary}\n`)
  }
  if (stats.failed) process.exitCode = 1
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.message)
    process.exitCode = 1
  })
}
