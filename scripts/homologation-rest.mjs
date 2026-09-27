import assert from "node:assert/strict"
import { createHmac } from "node:crypto"
import { execFileSync } from "node:child_process"

// RFC 6238, somente para o fator temporário da fixture. Nunca grava o segredo.
export function totp(secret, milliseconds = Date.now()) {
  assert.match(secret, /^[A-Z2-7]{16,128}$/)
  assert.ok(Number.isSafeInteger(milliseconds) && milliseconds >= 0)
  let bits = ""
  for (const char of secret)
    bits += "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567"
      .indexOf(char)
      .toString(2)
      .padStart(5, "0")
  const key = Buffer.from(bits.match(/.{8}/g).map((byte) => parseInt(byte, 2)))
  const counter = Buffer.alloc(8)
  counter.writeBigUInt64BE(BigInt(Math.floor(milliseconds / 30000)))
  const mac = createHmac("sha1", key).update(counter).digest()
  return ((mac.readUInt32BE(mac[19] & 15) & 0x7fffffff) % 1000000)
    .toString()
    .padStart(6, "0")
}

async function request(url, headers, method = "GET", body) {
  const response = await fetch(url, {
    headers: { ...headers, "Content-Type": "application/json" },
    method,
    ...(body ? { body: JSON.stringify(body) } : {}),
    redirect: "error",
    signal: AbortSignal.timeout(15000),
  })
  const chunks = []
  let size = 0
  for await (const chunk of response.body ?? []) {
    size += chunk.length
    assert.ok(size <= 1024 * 1024, "Oversized protected response")
    chunks.push(chunk)
  }
  return {
    status: response.status,
    data: size ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : null,
  }
}

export async function checkHomologationAuthority(env = process.env) {
  const ref = "odphoxozclrshqjgwbqk"
  assert.equal(env.SUPABASE_PROJECT_REF, ref)
  assert.equal(env.SUPABASE_URL, `https://${ref}.supabase.co`)
  assert.ok(env.SUPABASE_ACCESS_TOKEN?.trim())
  assert.ok(env.SUPABASE_PUBLISHABLE_KEY?.startsWith("sb_publishable_"))
  const keys = await request(
    `https://api.supabase.com/v1/projects/${ref}/api-keys?reveal=true`,
    { Authorization: `Bearer ${env.SUPABASE_ACCESS_TOKEN}` },
  )
  assert.equal(keys.status, 200)
  const serviceKey = keys.data.find((key) => key.name === "service_role")
    ?.api_key
  assert.ok(typeof serviceKey === "string" && serviceKey.startsWith("eyJ"))
  const admin = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` }
  const probe = await request(
    `${env.SUPABASE_URL}/auth/v1/admin/users?page=1&per_page=1`,
    admin,
  )
  assert.equal(
    probe.status,
    200,
    "Auth Admin authority unavailable before database write",
  )
  return admin
}

export async function checkHomologationRest(
  env = process.env,
  sessionQuery = (sql) =>
    execFileSync(
      "psql",
      ["-X", "-w", "-A", "-t", "-q", "-v", "ON_ERROR_STOP=1"],
      {
        input: sql,
        encoding: "utf8",
        timeout: 20000,
        stdio: ["pipe", "pipe", "pipe"],
        env: Object.fromEntries(
          [
            "PATH",
            "PGHOST",
            "PGPORT",
            "PGDATABASE",
            "PGUSER",
            "PGPASSWORD",
            "PGSSLMODE",
            "PGSSLROOTCERT",
            "PGCONNECT_TIMEOUT",
          ]
            .filter((key) => env[key])
            .map((key) => [key, env[key]]),
        ),
      },
    ),
) {
  const admin = await checkHomologationAuthority(env)
  const userHeaders = (jwt) => ({
    apikey: env.SUPABASE_PUBLISHABLE_KEY,
    ...(jwt ? { Authorization: `Bearer ${jwt}` } : {}),
  })
  const auth = (path, headers, method, body) =>
    request(`${env.SUPABASE_URL}/auth/v1/${path}`, headers, method, body)
  const rest = (path, jwt, body) =>
    request(
      `${env.SUPABASE_URL}/rest/v1/${path}`,
      userHeaders(jwt),
      body ? "POST" : "GET",
      body,
    )
  const sessions = []
  const sessionIds = new Set()
  let factor
  const trackSession = (jwt) => {
    const id = JSON.parse(
      Buffer.from(jwt.split(".")[1], "base64url").toString(),
    ).session_id
    assert.match(id, /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/)
    sessionIds.add(id)
  }
  const uid = (n) => `01000000-0000-4000-8000-${String(n).padStart(12, "0")}`
  const profile = (n) =>
    `02000000-0000-4000-8000-${String(n).padStart(12, "0")}`
  const fixtures = [
    [1, "fixture-active@example.invalid"],
    [5, "fixture-member@example.invalid"],
    [2, "fixture-suspended@example.invalid"],
    [3, "fixture-deletion@example.invalid"],
  ]
  assert.match(env.GITHUB_RUN_ID ?? "", /^[1-9][0-9]*$/)
  assert.match(env.GITHUB_RUN_ATTEMPT ?? "", /^[1-9][0-9]*$/)
  const marker = `phase0-${env.GITHUB_RUN_ID}-${env.GITHUB_RUN_ATTEMPT}`
  const ids = fixtures.map(([n]) => `'${uid(n)}'`).join(",")
  const assertNoAccess = () =>
    assert.equal(
      sessionQuery(
        `begin read only; select (select count(*) from auth.sessions where user_id in(${ids})) + (select count(*) from auth.mfa_factors where user_id in(${ids})); rollback;`,
      ).trim(),
      "0",
      "Synthetic Auth residue requires protected maintenance before retry",
    )
  // These four identities are exclusively reserved for this smoke. Never clean another account.
  for (const [n, email] of fixtures) {
    const existing = await auth(`admin/users/${uid(n)}`, admin)
    assert.equal(existing.status, 200)
    assert.equal(existing.data.id, uid(n))
    assert.equal(existing.data.email, email)
    assert.ok(
      existing.data.email_confirmed_at,
      "Fixture must already have confirmed email",
    )
  }
  assertNoAccess()
  try {
    for (const [n, email] of fixtures) {
      const link = await auth("admin/generate_link", admin, "POST", {
        type: "magiclink",
        email,
      })
      assert.equal(link.status, 200)
      assert.equal(link.data.id, uid(n))
      assert.ok(
        typeof link.data.hashed_token === "string" &&
          link.data.hashed_token.length > 20,
      )
      const session = await auth("verify", userHeaders(), "POST", {
        token_hash: link.data.hashed_token,
        type: "email",
      })
      assert.equal(session.status, 200)
      assert.equal(session.data.user.id, uid(n))
      assert.ok(session.data.access_token)
      sessions.push({ n, jwt: session.data.access_token })
      trackSession(session.data.access_token)
    }
    const jwt = (n) => sessions.find((session) => session.n === n).jwt
    const anon = await rest(
      `profiles?select=id,kind,name&owner_id=eq.${uid(1)}`,
    )
    // owner_id is a private column: direct selection/filter must not reveal it.
    assert.ok([401, 403].includes(anon.status))
    const publicProfiles = await rest(
      `profiles?select=id,kind,name&id=in.(${profile(1)},${profile(4)},${profile(5)})`,
    )
    assert.equal(publicProfiles.status, 200)
    assert.deepEqual(
      publicProfiles.data.map((row) => row.id),
      [profile(1)],
    )
    const internal = await rest(
      `profiles?select=id,kind,name,description,city,state_code&id=eq.${profile(4)}`,
      jwt(5),
    )
    assert.equal(internal.status, 200)
    assert.equal(internal.data[0].id, profile(4))
    assert.equal(internal.data[0].owner_id, undefined)
    for (const n of [2, 3]) {
      const hidden = await rest("rpc/get_profile", jwt(n), {
        target: profile(1),
      })
      assert.equal(hidden.status, 200)
      assert.equal(hidden.data, null)
    }
    const professionals = (otherJwt, target = profile(8)) =>
      rest(
        `professional_details?select=profile_id&profile_id=eq.${target}`,
        otherJwt,
      )
    const memberDenied = await professionals(jwt(5), profile(1))
    assert.equal(memberDenied.status, 200)
    assert.deepEqual(memberDenied.data, [])
    const beforeMfa = await professionals(jwt(1))
    assert.equal(beforeMfa.status, 200)
    assert.deepEqual(beforeMfa.data, [])
    const denial = await rest("rpc/get_collective_member_activity", jwt(5), {
      target: "05000000-0000-4000-8000-000000000001",
    })
    assert.equal(denial.status, 403)
    for (const n of [4, 7]) {
      const hidden = await rest("rpc/get_event", undefined, {
        target: `0a000000-0000-4000-8000-${String(n).padStart(12, "0")}`,
      })
      assert.equal(hidden.status, 200)
      assert.equal(hidden.data, null)
    }
    const history = await rest("rpc/get_messages", jwt(5), {
      target: "0d000000-0000-4000-8000-000000000006",
    })
    assert.equal(history.status, 200)
    assert.equal(history.data[0].sender_name, "Conta excluída")
    const enrolled = await auth("factors", userHeaders(jwt(1)), "POST", {
      factor_type: "totp",
      friendly_name: marker,
    })
    assert.equal(enrolled.status, 200)
    assert.match(enrolled.data.id, /^[a-f0-9-]{36}$/)
    factor = enrolled.data.id
    const challenge = await auth(
      `factors/${factor}/challenge`,
      userHeaders(jwt(1)),
      "POST",
      {},
    )
    assert.equal(challenge.status, 200)
    const verified = await auth(
      `factors/${factor}/verify`,
      userHeaders(jwt(1)),
      "POST",
      {
        challenge_id: challenge.data.id,
        code: totp(enrolled.data.totp.secret),
      },
    )
    assert.equal(verified.status, 200)
    assert.ok(verified.data.access_token)
    sessions.find((session) => session.n === 1).jwt = verified.data.access_token
    trackSession(verified.data.access_token)
    const sensitive = await professionals(jwt(1))
    assert.equal(sensitive.status, 200)
    assert.deepEqual(
      sensitive.data.map((row) => row.profile_id),
      [profile(8)],
    )
    // Delete only the factor created by this run; stale AAL2 cannot retain access.
    const removed = await auth(
      `admin/users/${uid(1)}/factors/${factor}`,
      admin,
      "DELETE",
    )
    assert.equal(removed.status, 200)
    factor = undefined
    const revoked = await professionals(jwt(1))
    assert.equal(revoked.status, 200)
    assert.deepEqual(revoked.data, [])
  } finally {
    // A lost enrollment response can leave a factor whose ID was never received.
    const cleanups = await Promise.allSettled([
      (async () => {
        const inventory = await auth(`admin/users/${uid(1)}`, admin)
        assert.equal(inventory.status, 200)
        assert.equal(inventory.data.id, uid(1))
        assert.equal(inventory.data.email, fixtures[0][1])
        const factors = (inventory.data.factors ?? []).filter(
          (item) => item.friendly_name === marker,
        )
        for (const item of factors) {
          assert.match(item.id, /^[a-f0-9-]{36}$/)
          const removed = await auth(
            `admin/users/${uid(1)}/factors/${item.id}`,
            admin,
            "DELETE",
          )
          assert.equal(removed.status, 200)
        }
      })(),
      ...sessions.map((session) =>
        auth("logout?scope=local", userHeaders(session.jwt), "POST").then(
          (result) => assert.ok([204, 401, 403].includes(result.status)),
        ),
      ),
    ])
    // Covers unreceived verify responses and prior interrupted executions, not only known JWTs.
    assertNoAccess()
    assert.ok(
      cleanups.every((result) => result.status === "fulfilled"),
      "Synthetic Auth cleanup failed",
    )
  }
  console.log(
    "REST + real Auth verified: public/internal projections, private data, suspended accounts, historical messages, owner MFA and revocation. No email sent; no session or factor persisted.",
  )
}
