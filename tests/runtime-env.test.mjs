import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { test } from "node:test"
import { validateRuntimeEnv } from "../scripts/start-runtime.mjs"

const dev = {
  CIRCUITONE_RUNTIME: "development",
  SUPABASE_URL: "https://odphoxozclrshqjgwbqk.supabase.co",
  SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test",
  APP_ORIGIN: "https://circuitone-dev.magalz.space",
}

test("runtime requires an explicit mode and public Supabase configuration", () => {
  assert.throws(() => validateRuntimeEnv({}), /CIRCUITONE_RUNTIME/)
  assert.throws(() => validateRuntimeEnv({ CIRCUITONE_RUNTIME: "production" }))
  assert.equal(validateRuntimeEnv({ CIRCUITONE_RUNTIME: "preview" }), "preview")
  assert.throws(() =>
    validateRuntimeEnv({ CIRCUITONE_RUNTIME: "preview", SUPABASE_URL: dev.SUPABASE_URL }),
  )
  assert.equal(validateRuntimeEnv(dev), "development")
  assert.equal(
    validateRuntimeEnv({
      ...dev,
      SUPABASE_URL: "http://127.0.0.1:54321",
      APP_ORIGIN: "http://127.0.0.1:5182",
    }),
    "development",
  )
  for (const override of [
    { SUPABASE_URL: undefined },
    { SUPABASE_PUBLISHABLE_KEY: "sb_secret_x" },
    { APP_ORIGIN: undefined },
  ])
    assert.throws(() => validateRuntimeEnv({ ...dev, ...override }))
})

test("privileged credentials never enter the application container", () => {
  for (const name of [
    "SUPABASE_DB_PASSWORD",
    "SUPABASE_SERVICE_ROLE_KEY",
    "DATABASE_URL",
    "PGPASSWORD",
    "AWS_SECRET_ACCESS_KEY",
  ])
    assert.throws(() => validateRuntimeEnv({ ...dev, [name]: "x" }), /Privileged/)
})

test("the container starts through the runtime guard", () => {
  const packageJson = JSON.parse(readFileSync("package.json", "utf8"))
  assert.equal(packageJson.scripts.start, "node scripts/start-runtime.mjs")
  assert.match(
    readFileSync("Dockerfile", "utf8"),
    /COPY --from=build .*\/app\/scripts\/start-runtime\.mjs .*\/scripts\/start-runtime\.mjs/,
  )
})
