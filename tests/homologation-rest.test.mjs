import assert from "node:assert/strict"
import { test } from "node:test"
import { totp, checkHomologationRest } from "../scripts/homologation-rest.mjs"
import { storageFixture } from "../scripts/homologation-storage.mjs"

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
    GITHUB_RUN_ATTEMPT: "1",
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
  for (const failure of [
    "none",
    "challenge",
    "enroll-response",
    "verify-response",
    "residue",
    "storage-exposed",
    "account-crossed",
  ]) {
    const calls = []
    let mfa = false
    let deleted = false
    let enrolledFactor = false
    let unknownSession = false
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
      if (path.startsWith("/storage/v1/")) {
        if (path.endsWith("/bucket/" + storageFixture.bucket)) {
          assert.equal(init.headers.apikey, "eyJ.synthetic-admin")
          return Response.json({
            id: storageFixture.bucket,
            name: storageFixture.bucket,
            public: false,
            file_size_limit: 1024,
            allowed_mime_types: ["text/plain"],
          })
        }
        assert.equal(init.headers.apikey, env.SUPABASE_PUBLISHABLE_KEY)
        return init.headers.Authorization === "Bearer " + token(1) ||
          failure === "storage-exposed"
          ? new Response(storageFixture.bytes)
          : Response.json({}, { status: 404 })
      }
      if (path.startsWith("/auth/v1/admin/")) {
        assert.equal(init.headers.apikey, "eyJ.synthetic-admin")
        if (path.endsWith("/users")) return Response.json({ users: [] })
        if (path.includes("/factors/")) {
          deleted = true
          mfa = false
          enrolledFactor = false
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
          factors:
            n === 1 && enrolledFactor
              ? [
                  {
                    id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
                    friendly_name: "phase0-123-1",
                  },
                ]
              : [],
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
        if (failure === "verify-response") {
          unknownSession = true
          throw new Error("response lost after session creation")
        }
        return Response.json({ user: { id: uid(n) }, access_token: token(n) })
      }
      if (path.endsWith("/factors")) {
        enrolledFactor = true
        if (failure === "enroll-response")
          throw new Error("response lost after factor creation")
        return Response.json({
          id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          totp: { secret: "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ" },
        })
      }
      if (path.endsWith("/challenge"))
        return Response.json({ id: "challenge" }, {
          status: failure === "challenge" ? 500 : 200,
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
      if (path.endsWith("get_account_session")) {
        if (!init.headers.Authorization) return Response.json({}, { status: 401 });
        const n = Number(
          JSON.parse(
            Buffer.from(init.headers.Authorization.split(".")[1], "base64url").toString(),
          ).session_id.slice(-12),
        );
        return Response.json({
          id: uid(failure === "account-crossed" ? 99 : n),
          name: "Sintética",
          state: n === 2 ? "suspended" : n === 3 ? "deletion_pending" : "active",
          reason: null,
        });
      }
      if (path.endsWith("get_collective_member_activity"))
        return Response.json({}, { status: 403 })
      if (path.endsWith("get_messages"))
        return Response.json([{ sender_name: "Conta excluída" }])
      if (path.endsWith("get_event") && body.target.endsWith("000004"))
        return Response.json({ state: "cancelled" })
      if (path.endsWith("list_events")) return Response.json([])
      if (path.endsWith("get_profile") || path.endsWith("get_event"))
        return Response.json(null)
      throw new Error("unexpected fixture route")
    }
    try {
      let inventories = 0
      const query = (sql) => {
        if (sql.includes("select owner_id from storage.objects")) return uid(1)
        if (sql.startsWith("begin;")) {
          assert.match(sql, /Synthetic Storage policy collision/)
          return ""
        }
        assert.match(sql, /begin read only/)
        for (const n of [1, 2, 3, 5]) assert.ok(sql.includes(uid(n)))
        inventories++
        assert.ok(
          sql.includes("user_id"),
          "Inventory must cover unknown fixture sessions",
        )
        return unknownSession || failure === "residue" ? "1" : "0"
      }
      if (failure !== "none")
        await assert.rejects(checkHomologationRest(env, query))
      else await checkHomologationRest(env, query)
      if (failure === 'none') assert.ok(calls.some(call => call.url.endsWith('rpc/get_account_session')), 'Homologation must validate the minimal own-account projection')
      if (failure === "none")
        assert.ok(
          calls.some((call) => call.url.includes("/storage/v1/")),
          "Homologation must prepare and verify the owned Storage fixture",
        )
      if (["none", "challenge", "enroll-response"].includes(failure))
        assert.ok(
          deleted,
          "Temporary factor must be reconciled even if response is lost",
        )
      if (failure === "residue") {
        assert.equal(inventories, 1)
        assert.ok(
          !calls.some((call) =>
            /(?:generate_link|\/verify|\/factors)$/.test(call.url),
          ),
          "Retry must block before any mutation",
        )
      } else assert.ok(inventories >= 2)
      assert.ok(!calls.some((call) => /\/invite|\/otp|password/.test(call.url)))
    } finally {
      globalThis.fetch = original
    }
  }
})
