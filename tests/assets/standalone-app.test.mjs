import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

test('o build SSR publica cliente e servidor sem metadados do Figma', () => {
  execFileSync(process.execPath, ['node_modules/@react-router/dev/bin.cjs', 'build'], { stdio: 'pipe' })
  const server = join('build', 'server', 'index.js')
  assert.ok(existsSync(server))
  assert.doesNotMatch(readFileSync(server, 'utf8'), /Figma Make App|Streamline document management/i)
  assert.equal(readFileSync(join('build', 'client', 'robots.txt'), 'utf8'), 'User-agent: *\nDisallow: /\n')
})

test("real SSR document and data routes preserve session cookies, privacy and account isolation", async () => {
  const { createRequestHandler } = await import("react-router");
  const build = await import("../../build/server/index.js");
  const handler = createRequestHandler(build, "production");
  const origin = "https://circuitone-dev.magalz.space";
  const saved = { ...process.env };
  const originalFetch = globalThis.fetch;
  Object.assign(process.env, {
    CIRCUITONE_RUNTIME: "development",
    APP_ORIGIN: origin,
    SUPABASE_URL: "https://odphoxozclrshqjgwbqk.supabase.co",
    SUPABASE_PUBLISHABLE_KEY: "sb_publishable_synthetic",
  });
  const uid = "81000000-0000-4000-8000-000000000001";
  const jwt = [
    "eyJhbGciOiJIUzI1NiJ9",
    Buffer.from(JSON.stringify({ sub: uid, exp: Math.floor(Date.now() / 1000) + 3600 })).toString(
      "base64url",
    ),
    "synthetic",
  ].join(".");
  globalThis.fetch = async (url, init) => {
    const path = new URL(url).pathname;
    if (path === "/auth/v1/token")
      return Response.json({
        access_token: jwt,
        refresh_token: "synthetic-refresh",
        expires_in: 3600,
        token_type: "bearer",
        user: { id: uid, email: "ssr@example.invalid" },
      });
    if (path === "/auth/v1/user") return Response.json({ id: uid, email: "ssr@example.invalid" });
    if (path === "/rest/v1/rpc/get_account_session")
      return Response.json({
        id: uid,
        name: "Identidade SSR sintética",
        state: "active",
        reason: null,
      });
    if (path === "/auth/v1/logout") return new Response(null, { status: 204 });
    throw new Error("Unexpected SSR provider request");
  };
  try {
    const login = await handler(
      new Request(origin + "/entrar", {
        method: "POST",
        headers: { Origin: origin, "Content-Type": "application/x-www-form-urlencoded" },
        body: "email=ssr%40example.invalid&password=synthetic-only-password",
      }),
    );
    assert.equal(login.status, 303);
    assert.equal(login.headers.get("location"), "/painel");
    const values = login.headers.getSetCookie();
    assert.ok(values.length);
    for (const value of values) {
      assert.match(value, /HttpOnly/);
      assert.match(value, /Secure/);
      assert.match(value, /SameSite=Lax/);
    }
    const Cookie = values.map((value) => value.split(";")[0]).join("; ");
    for (const path of ["/painel", "/painel.data"]) {
      const response = await handler(new Request(origin + path, { headers: { Cookie } }));
      assert.equal(response.status, 200);
      assert.match(response.headers.get("cache-control"), /no-store/);
      const body = await response.text();
      assert.match(body, /Identidade SSR sintética/);
      assert.doesNotMatch(body, /Ana Ribeiro|synthetic-refresh|synthetic-only-password/);
    }
    const blocked = await handler(new Request(origin + "/painel/mensagens"));
    assert.equal(blocked.status, 303);
    assert.equal(blocked.headers.get("location"), "/entrar");
    const logout = await handler(
      new Request(origin + "/sair", {
        method: "POST",
        headers: { Origin: origin, Cookie, "Content-Type": "application/x-www-form-urlencoded" },
        body: "",
      }),
    );
    assert.equal(logout.status, 303);
    assert.match(logout.headers.get("set-cookie"), /Max-Age=0/);
  } finally {
    globalThis.fetch = originalFetch;
    for (const key of Object.keys(process.env)) if (!(key in saved)) delete process.env[key];
    Object.assign(process.env, saved);
  }
});
