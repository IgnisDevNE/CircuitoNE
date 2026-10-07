import { spawn } from "node:child_process"
import { resolve } from "node:path"
import { fileURLToPath } from "node:url"

export function validateRuntimeEnv(env) {
  const publicSupabase = new Set(["SUPABASE_URL", "SUPABASE_PUBLISHABLE_KEY"])
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
  if (mode !== "development")
    throw new Error("CIRCUITONE_RUNTIME must be development")
  if (
    !/^https?:\/\/[^/]+$/.test(env.SUPABASE_URL ?? "") ||
    !env.SUPABASE_PUBLISHABLE_KEY?.startsWith("sb_publishable_") ||
    !/^https?:\/\/[^/]+$/.test(env.APP_ORIGIN ?? "")
  )
    throw new Error(
      "Development requires SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY and APP_ORIGIN",
    )
  return mode
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    validateRuntimeEnv(process.env)
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
  } catch (error) {
    console.error(error.message)
    process.exitCode = 1
  }
}
