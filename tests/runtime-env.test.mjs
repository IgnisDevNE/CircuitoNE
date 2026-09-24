import assert from "node:assert/strict"
import { once } from "node:events"
import { readFileSync } from "node:fs"
import { test } from "node:test"
import {
  createWaitingServer,
  validateRuntimeEnv,
} from "../scripts/start-runtime.mjs"

const prod = {
  CIRCUITONE_RUNTIME: "production",
  SUPABASE_PROJECT_REF: "ukyoyrmebwadmuzkswdw",
  SUPABASE_URL: "https://ukyoyrmebwadmuzkswdw.supabase.co",
  DEMO_MODE: "false",
}

test("runtime fails closed and binds each deployed mode to its exact Supabase project", () => {
  assert.throws(() => validateRuntimeEnv({}), /CIRCUITONE_RUNTIME/)
  assert.equal(validateRuntimeEnv({ CIRCUITONE_RUNTIME: "preview" }), "preview")
  assert.throws(() =>
    validateRuntimeEnv({
      CIRCUITONE_RUNTIME: "preview",
      SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test",
    }),
  )
  assert.equal(validateRuntimeEnv(prod), "production")
  assert.equal(
    validateRuntimeEnv({
      CIRCUITONE_RUNTIME: "development",
      SUPABASE_PROJECT_REF: "odphoxozclrshqjgwbqk",
      SUPABASE_URL: "https://odphoxozclrshqjgwbqk.supabase.co",
      DEMO_MODE: "true",
    }),
    "development",
  )

  for (const override of [
    { SUPABASE_PROJECT_REF: "mwgccjvztzbderlwtheg" },
    { SUPABASE_PROJECT_REF: "odphoxozclrshqjgwbqk" },
    { SUPABASE_URL: "https://odphoxozclrshqjgwbqk.supabase.co" },
    { DEMO_MODE: "true" },
    { DEMO_MODE: undefined },
    { SUPABASE_DB_PASSWORD: "should-not-be-here" },
    { DATABASE_URL: "should-not-be-here" },
    { PGPASSWORD: "should-not-be-here" },
    { SUPABASE_FUTURE_PRIVATE: "should-not-be-here" },
  ])
    assert.throws(() => validateRuntimeEnv({ ...prod, ...override }))
})

test("production serves only a noindex waiting page and health response", async () => {
  const server = createWaitingServer()
  server.listen(0, "127.0.0.1")
  await once(server, "listening")
  const base = `http://127.0.0.1:${server.address().port}`
  try {
    const home = await fetch(base)
    assert.equal(home.status, 200)
    assert.match(await home.text(), /CircuitoNE.*em prepara[cç][aã]o/i)
    assert.equal(home.headers.get("cache-control"), "no-store")
    const login = await fetch(`${base}/entrar`)
    assert.equal(login.status, 404)
    const health = await fetch(`${base}/healthz`)
    assert.equal(health.status, 200)
  } finally {
    await new Promise((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    )
  }
})

test("the container and CI route through the runtime guard", () => {
  const packageJson = JSON.parse(readFileSync("package.json", "utf8"))
  assert.equal(packageJson.scripts.start, "node scripts/start-runtime.mjs")
  assert.match(
    readFileSync("Dockerfile", "utf8"),
    /COPY --from=build .*\/app\/scripts\/start-runtime\.mjs .*\/scripts\/start-runtime\.mjs/,
  )
  assert.match(
    readFileSync(".github/workflows/ci.yml", "utf8"),
    /--env CIRCUITONE_RUNTIME=preview .*circuitone-app-ci/,
  )
})
