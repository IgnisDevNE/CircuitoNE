import { spawn } from "node:child_process"
import { createServer } from "node:http"
import { resolve } from "node:path"
import { fileURLToPath } from "node:url"

const projects = {
  development: "odphoxozclrshqjgwbqk",
  production: "ukyoyrmebwadmuzkswdw",
}

export function validateRuntimeEnv(env) {
  const publicSupabase = new Set([
    "SUPABASE_PROJECT_REF",
    "SUPABASE_URL",
    "SUPABASE_PUBLISHABLE_KEY",
  ])
  for (const name of Object.keys(env)) {
    if (
      (name.toUpperCase().startsWith("SUPABASE_") &&
        !publicSupabase.has(name)) ||
      /^(?:PG|.*(?:PASSWORD|SECRET|TOKEN|PRIVATE_KEY)|(?:DATABASE|POSTGRES|DB)_URL$)/i.test(
        name,
      )
    ) {
      throw new Error(
        `Privileged credential ${name} must not enter the application container`,
      )
    }
  }

  const mode = env.CIRCUITONE_RUNTIME
  if (mode === "preview") {
    if (
      env.SUPABASE_PROJECT_REF ||
      env.SUPABASE_URL ||
      env.SUPABASE_PUBLISHABLE_KEY
    )
      throw new Error("Preview must not receive a shared Supabase project")
    return mode
  }
  const ref = projects[mode]
  if (!ref)
    throw new Error(
      "CIRCUITONE_RUNTIME must be preview, development or production",
    )
  if (
    env.SUPABASE_PROJECT_REF !== ref ||
    env.SUPABASE_URL !== `https://${ref}.supabase.co`
  ) {
    throw new Error("Supabase project does not match CIRCUITONE_RUNTIME")
  }
  if (env.DEMO_MODE !== (mode === "development" ? "true" : "false")) {
    throw new Error("DEMO_MODE does not match CIRCUITONE_RUNTIME")
  }
  return mode
}

const waitingHtml = `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex, nofollow"><title>CircuitoNE em preparação</title><style>body{font-family:system-ui,sans-serif;background:#0c1220;color:#f7f3eb;min-height:100vh;display:grid;place-items:center;margin:0}main{max-width:38rem;padding:2rem}h1{font-size:clamp(2rem,6vw,4rem);line-height:1.1}p{color:#c6cad1;font-size:1.15rem;line-height:1.5}</style></head><body><main><h1>CircuitoNE em preparação</h1><p>Estamos preparando o portal. Volte em breve.</p></main></body></html>`

export function createWaitingServer() {
  return createServer((request, response) => {
    response.setHeader("Cache-Control", "no-store")
    response.setHeader("X-Content-Type-Options", "nosniff")
    response.setHeader(
      "Content-Security-Policy",
      "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'",
    )
    if (request.url === "/healthz") {
      response
        .writeHead(200, { "Content-Type": "text/plain; charset=utf-8" })
        .end("ok")
    } else if (request.url === "/") {
      response
        .writeHead(200, { "Content-Type": "text/html; charset=utf-8" })
        .end(waitingHtml)
    } else {
      response
        .writeHead(404, { "Content-Type": "text/plain; charset=utf-8" })
        .end("Not found")
    }
  })
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    const mode = validateRuntimeEnv(process.env)
    if (mode === "production") {
      createWaitingServer().listen(
        Number(process.env.PORT || 3000),
        process.env.HOST || "0.0.0.0",
      )
    } else {
      const cli = fileURLToPath(
        new URL("../node_modules/@react-router/serve/bin.cjs", import.meta.url),
      )
      const child = spawn(process.execPath, [cli, "build/server/index.js"], {
        stdio: "inherit",
      })
      for (const signal of ["SIGINT", "SIGTERM"])
        process.on(signal, () => child.kill(signal))
      child.on("error", (error) => {
        console.error(error.message)
        process.exitCode = 1
      })
      child.on("exit", (code) => {
        process.exitCode = code ?? 1
      })
    }
  } catch (error) {
    console.error(error.message)
    process.exitCode = 1
  }
}
