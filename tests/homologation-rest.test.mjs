import assert from "node:assert/strict"
import { test } from "node:test"
import { totp, checkHomologationRest } from "../scripts/homologation-rest.mjs"

test("real TOTP follows RFC 6238 and rejects invalid input", () => {
  assert.equal(totp("GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ", 59000), "287082")
  assert.throws(() => totp("not-base32"))
})

test("production or malformed credentials fail before any HTTP request", async () => {
  const original = globalThis.fetch
  let calls = 0
  globalThis.fetch = async () => {
    calls++
    throw new Error("unexpected fetch")
  }
  try {
    for (const invalid of [
      {},
      { SUPABASE_PROJECT_REF: "ukyoyrmebwadmuzkswdw" },
      {
        SUPABASE_PROJECT_REF: "odphoxozclrshqjgwbqk",
        SUPABASE_URL: "https://attacker.invalid",
      },
    ]) {
      await assert.rejects(checkHomologationRest(invalid))
    }
    assert.equal(calls, 0)
  } finally {
    globalThis.fetch = original
  }
})

test("sessions use public credentials, MFA is real, and failure still revokes synthetic access", async () => {
  const original = globalThis.fetch
  const env = {
    SUPABASE_PROJECT_REF: "odphoxozclrshqjgwbqk",
    SUPABASE_URL: "https://odphoxozclrshqjgwbqk.supabase.co",
    SUPABASE_ACCESS_TOKEN: "synthetic-pat",
    SUPABASE_PUBLISHABLE_KEY: "sb_publishable_fixture",
    GITHUB_RUN_ID: "123",
  }
  const uid = (n) => `01000000-0000-4000-8000-${String(n).padStart(12, "0")}`
  const profile = (n) =>
    `02000000-0000-4000-8000-${String(n).padStart(12, "0")}`
  const emails = {
    1: "fixture-active@example.invalid",
    2: "fixture-suspended@example.invalid",
    3: "fixture-deletion@example.invalid",
    5: "fixture-member@example.invalid",
  }
  const token = (n) =>
    `eyJ.${Buffer.from(JSON.stringify({ session_id: uid(n) })).toString("base64url")}.synthetic`
  for (const failChallenge of [false, true]) {
    const calls = []
    let mfa = false
    let deleted = false
    globalThis.fetch = async (url, init) => {
      const body = init.body && JSON.parse(init.body)
      calls.push({ url, ...init })
      if (url.startsWith("https://api.supabase.com/")) {
        assert.equal(init.headers.Authorization, "Bearer synthetic-pat")
        return Response.json([
          { name: "service_role", api_key: "eyJ.synthetic-admin" },
        ])
      }
      assert.ok(url.startsWith(env.SUPABASE_URL))
      assert.equal(init.redirect, "error")
      assert.ok(init.signal)
      const path = new URL(url).pathname
      if (path.startsWith("/auth/v1/admin/")) {
        assert.equal(init.headers.apikey, "eyJ.synthetic-admin")
        if (path.endsWith("/users")) return Response.json({ users: [] })
        if (path.includes("/factors/")) {
          deleted = true
          mfa = false
          return Response.json({})
        }
        const n = Number(path.slice(-12))
        if (path.endsWith("generate_link")) {
          const id = Number(
            Object.entries(emails).find(([, email]) => email === body.email)[0],
          )
          return Response.json({
            id: uid(id),
            hashed_token: `synthetic-hashed-token-for-${id}`,
          })
        }
        return Response.json({
          id: uid(n),
          email: emails[n],
          email_confirmed_at: "2026-09-26T12:00Z",
        })
      }
      assert.equal(init.headers.apikey, env.SUPABASE_PUBLISHABLE_KEY)
      assert.notEqual(init.headers.Authorization, "Bearer eyJ.synthetic-admin")
      if (path.endsWith("/verify") && path.startsWith("/auth/v1/factors/")) {
        assert.match(body.code, /^[0-9]{6}$/)
        mfa = true
        return Response.json({ access_token: token(1) })
      }
      if (path.endsWith("/verify")) {
        const n = Number(body.token_hash.slice(-1))
        return Response.json({ user: { id: uid(n) }, access_token: token(n) })
      }
      if (path.endsWith("/factors"))
        return Response.json({
          id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          totp: { secret: "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ" },
        })
      if (path.endsWith("/challenge"))
        return Response.json({ id: "challenge" }, {
          status: failChallenge ? 500 : 200,
        })
      if (path.endsWith("/logout")) return new Response(null, { status: 204 })
      if (path.endsWith("/profiles")) {
        if (url.includes("owner_id")) return Response.json({}, { status: 403 })
        return Response.json([
          {
            id: profile(
              url.includes("select=id,kind,name,description") ? 4 : 1,
            ),
          },
        ])
      }
      if (path.endsWith("/professional_details"))
        return Response.json(mfa ? [{ profile_id: profile(8) }] : [])
      if (path.endsWith("get_collective_member_activity"))
        return Response.json({}, { status: 403 })
      if (path.endsWith("get_messages"))
        return Response.json([{ sender_name: "Conta excluída" }])
      if (path.endsWith("get_profile") || path.endsWith("get_event"))
        return Response.json(null)
      throw new Error("unexpected fixture route")
    }
    try {
      const query = (sql) => {
        assert.match(sql, /begin read only/)
        for (const n of [1, 2, 3, 5]) assert.ok(sql.includes(uid(n)))
        return "0"
      }
      if (failChallenge) await assert.rejects(checkHomologationRest(env, query))
      else await checkHomologationRest(env, query)
      assert.ok(
        deleted,
        "Temporary factor must be deleted even if challenge fails",
      )
      assert.equal(
        calls.filter((call) => call.url.includes("/logout?scope=local")).length,
        4,
      )
      assert.ok(!calls.some((call) => /\/invite|\/otp|password/.test(call.url)))
    } finally {
      globalThis.fetch = original
    }
  }
})
