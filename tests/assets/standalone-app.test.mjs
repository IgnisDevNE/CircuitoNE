import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const files = (dir) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? files(join(dir, entry.name)) : entry.name.endsWith('.js') ? [join(dir, entry.name)] : [],
  )

test('o build SSR publica cliente e servidor sem metadados do Figma nem dados do protótipo', () => {
  execFileSync(process.execPath, ['node_modules/@react-router/dev/bin.cjs', 'build'], { stdio: 'pipe' })
  const server = join('build', 'server', 'index.js')
  assert.ok(existsSync(server))
  assert.doesNotMatch(readFileSync(server, 'utf8'), /Figma Make App|Streamline document management/i)
  // Nenhum dado de mentira do protótipo (mock.ts, StoreContext) pode voltar ao bundle do servidor ou do cliente.
  for (const file of [...files(join('build', 'server')), ...files(join('build', 'client'))])
    assert.doesNotMatch(readFileSync(file, 'utf8'), /Ana Ribeiro|ANERIE|LITORAL SUL|\[demo\] entrar|useStore must be/, file)
  assert.equal(readFileSync(join('build', 'client', 'robots.txt'), 'utf8'), 'User-agent: *\nDisallow: /\n')
  // O navegador pede /favicon.ico sem ler o HTML: os dois formatos saem no cliente.
  for (const icon of ['favicon.ico', 'favicon.svg']) assert.ok(existsSync(join('build', 'client', icon)), icon)
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
    if (["/rest/v1/rpc/list_my_profiles", "/rest/v1/rpc/list_my_collectives", "/rest/v1/rpc/list_conversations", "/rest/v1/rpc/list_events"].includes(path))
      return Response.json([]);
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
    // Envio do formulário já hidratado: o React Router posta em /entrar.data (single fetch) e o login deve funcionar igual.
    const clientLogin = await handler(
      new Request(origin + "/entrar.data", {
        method: "POST",
        headers: { Origin: origin, "Content-Type": "application/x-www-form-urlencoded" },
        body: "email=ssr%40example.invalid&password=synthetic-only-password",
      }),
    );
    assert.notEqual(clientLogin.status, 405);
    assert.match(await clientLogin.text(), /\/painel/);
    assert.ok(clientLogin.headers.getSetCookie().length);
    // Atrás do Cloudflare/Caddy o Node recebe http://, mas o navegador envia Origin https:// do domínio público.
    const proxiedLogin = await handler(
      new Request("http://circuitone-dev.magalz.space/entrar.data", {
        method: "POST",
        headers: { Origin: origin, "Content-Type": "application/x-www-form-urlencoded" },
        body: "email=ssr%40example.invalid&password=synthetic-only-password",
      }),
    );
    assert.notEqual(proxiedLogin.status, 400, "React Router recusou a origem pública atrás do proxy");
    assert.match(await proxiedLogin.text(), /\/painel/);
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
      assert.equal(response.headers.get("x-content-type-options"), "nosniff");
      const body = await response.text();
      if (path === "/painel") {
        // Documento: CSP com nonce por requisição e o script inline de hidratação carrega o mesmo nonce.
        const csp = response.headers.get("content-security-policy");
        const nonce = csp.match(/script-src 'self' 'nonce-([^']+)'/)[1];
        assert.ok(nonce.length >= 16);
        assert.match(csp, /frame-ancestors 'none'/);
        assert.equal(response.headers.get("x-frame-options"), "DENY");
        assert.equal(response.headers.get("referrer-policy"), "strict-origin-when-cross-origin");
        assert.equal(response.headers.get("cross-origin-opener-policy"), "same-origin");
        assert.ok(response.headers.get("permissions-policy"));
        const inline = [...body.matchAll(/<script(?![^>]*src=)[^>]*>/g)].map((match) => match[0]);
        assert.ok(inline.length > 0);
        for (const tag of inline) assert.ok(tag.includes(`nonce="${nonce}"`), tag);
        const next = await handler(new Request(origin + path, { headers: { Cookie } }));
        assert.notEqual(next.headers.get("content-security-policy").match(/'nonce-([^']+)'/)[1], nonce);
        await next.text();
      }
      assert.match(body, /Identidade SSR sintética/);
      assert.doesNotMatch(body, /Ana Ribeiro|synthetic-refresh|synthetic-only-password/);
    }
    const blocked = await handler(new Request(origin + "/painel/mensagens"));
    assert.equal(blocked.status, 302);
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
