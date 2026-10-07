// @vitest-environment node
import { beforeEach, afterEach, expect, test, vi } from "vitest";
import { loginAction, loginLoader, logoutAction, logoutLoader } from "../../src/server/auth.server";

const origin = "https://circuitone-dev.magalz.space";
const accounts = {
  A: { id: "A", name: "Pessoa A sintética", state: "active", reason: null },
  B: { id: "B", name: "Pessoa B sintética", state: "active", reason: null },
};
const token = (id: string, expired = false) =>
  [
    "eyJhbGciOiJIUzI1NiJ9",
    Buffer.from(
      JSON.stringify({ sub: id, exp: Math.floor(Date.now() / 1000) + (expired ? -20 : 3600) }),
    ).toString("base64url"),
    id,
  ].join(".");
const actor = (headers: Headers) =>
  (headers.get("authorization") ?? "").split(".").pop() as "A" | "B";
let calls: string[];
let state = "active";
let expired = false;
beforeEach(() => {
  calls = [];
  state = "active";
  expired = false;
  vi.stubEnv("CIRCUITONE_RUNTIME", "development");
  vi.stubEnv("APP_ORIGIN", origin);
  vi.stubEnv("SUPABASE_URL", "https://odphoxozclrshqjgwbqk.supabase.co");
  vi.stubEnv("SUPABASE_PUBLISHABLE_KEY", "sb_publishable_synthetic");
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string | Request | URL, options?: RequestInit) => {
      const u = new URL(String(url));
      calls.push(u.pathname);
      const headers = new Headers(options?.headers);
      if (u.pathname === "/auth/v1/token") {
        const body = JSON.parse(String(options?.body));
        const id = (
          body.email?.startsWith("b@") || body.refresh_token === "refresh-B" ? "B" : "A"
        ) as "A" | "B";
        if (body.password && body.password !== "synthetic-password")
          return Response.json(
            { code: "invalid_credentials", message: "Invalid login credentials" },
            { status: 400 },
          );
        return Response.json({
          access_token: token(id, expired),
          refresh_token: "refresh-" + id,
          expires_in: expired ? -20 : 3600,
          token_type: "bearer",
          user: {
            id,
            email: id.toLowerCase() + "@example.invalid",
            user_metadata: { name: "UNTRUSTED", role: "owner" },
          },
        });
      }
      if (u.pathname === "/auth/v1/user") {
        const id = actor(headers);
        return id in accounts
          ? Response.json({ id, email: id.toLowerCase() + "@example.invalid" })
          : Response.json({ message: "invalid JWT" }, { status: 401 });
      }
      if (u.pathname === "/rest/v1/rpc/get_account_session") {
        const id = actor(headers);
        return Response.json(
          state === "deleted"
            ? null
            : {
                ...accounts[id],
                state,
                reason: state === "suspended" ? "Análise sintética" : null,
              },
        );
      }
      if (u.pathname === "/auth/v1/logout") return new Response(null, { status: 204 });
      throw new Error("Unexpected HTTP request");
    }),
  );
});
afterEach(() => vi.unstubAllEnvs());
const login = async (
  email = "a@example.invalid",
  password = "synthetic-password",
  requestOrigin = origin,
) =>
  loginAction(
    new Request(origin + "/entrar", {
      method: "POST",
      headers: { Origin: requestOrigin, "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ email, password }),
    }),
  );
const cookie = (response: Response) =>
  response.headers
    .getSetCookie()
    .map((value) => value.split(";")[0])
    .join("; ");
const load = (cookies = "") =>
  loginLoader(new Request(origin + "/entrar", { headers: { Cookie: cookies } }));
const logout = (path: string, headers: Record<string, string>) =>
  logoutAction(
    new Request(origin + path, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", ...headers },
      body: "",
    }),
  );

test("visitor sees the form and incorrect credentials never create a session", async () => {
  const visitor = await load();
  expect(visitor.status).toBe(200);
  expect(await visitor.json()).toEqual({});
  const wrong = await login("a@example.invalid", "wrong");
  expect(wrong.status).toBe(400);
  expect((await wrong.json()).error).toBe("E-mail ou senha inválidos.");
  expect(cookie(wrong)).toBe("");
  const invalid = await login("not-an-email", "x");
  expect(invalid.status).toBe(400);
  expect(await invalid.json()).toEqual({ error: "Informe e-mail e senha válidos.", email: "not-an-email" });
});
test("real provider login survives SSR reload and two simultaneous accounts stay isolated", async () => {
  const [a, b] = await Promise.all([login(), login("b@example.invalid")]);
  expect(a.status).toBe(303);
  expect(b.status).toBe(303);
  expect(a.headers.get("location")).toBe("/painel");
  const [ra, rb] = await Promise.all([load(cookie(a)), load(cookie(b))]);
  // Quem já tem sessão não vê o formulário: segue para o painel, cada um com a própria identidade validada.
  for (const response of [ra, rb]) {
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("/painel");
  }
  for (const response of [a, b, ra, rb]) {
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(response.headers.get("vary")).toContain("Cookie");
  }
  expect(a.headers.get("set-cookie")).toContain("HttpOnly");
  expect(a.headers.get("set-cookie")).toContain("Secure");
  expect(a.headers.get("set-cookie")).toContain("SameSite=Lax");
  expect(calls.filter((path) => path === "/auth/v1/user")).toHaveLength(2);
});
test("cross-origin and absent-origin login/logout fail before provider access", async () => {
  for (const requestOrigin of ["https://attacker.invalid", ""]) {
    const denied = await login("a@example.invalid", "synthetic-password", requestOrigin);
    expect(denied.status).toBe(403);
    const deniedLogout = await logout("/sair", requestOrigin ? { Origin: requestOrigin } : {});
    expect(deniedLogout.status).toBe(403);
  }
  expect(calls).toEqual([]);
});
test("GET /sair only redirects to the login form and never touches the session", async () => {
  const response = logoutLoader();
  expect(response.status).toBe(303);
  expect(response.headers.get("location")).toBe("/entrar");
  expect(calls).toEqual([]);
});
test("logout clears cookies and is a POST protected by origin", async () => {
  const signed = await login();
  const response = await logout("/sair", { Origin: origin, Cookie: cookie(signed) });
  expect(response.status).toBe(303);
  expect(response.headers.get("location")).toBe("/entrar");
  expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
  expect(calls).toContain("/auth/v1/logout");
});
test("suspended, incomplete and deletion pending accounts leave /entrar for the panel, which shows the restriction", async () => {
  const signed = await login();
  for (const value of ["suspended", "incomplete", "deletion_pending", "active"]) {
    state = value;
    const response = await load(cookie(signed));
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("/painel");
  }
});
test("provider failure fails closed with no credentials in the response", async () => {
  const signed = await login();
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("private provider error")));
  const response = await login();
  expect(response.status).toBe(503);
  expect(await response.text()).not.toContain("synthetic-password");
  const page = await load(cookie(signed));
  expect(page.status).toBe(503);
  expect((await page.json()).error).toBeTruthy();
});
test("oversized forms, unknown mutations and wrong destination cannot reach Auth", async () => {
  expect((await login("a@example.invalid", "x".repeat(5000))).status).toBe(413);
  const unknown = await loginAction(
    new Request(origin + "/painel", {
      method: "POST",
      headers: { Origin: origin, "Content-Type": "application/x-www-form-urlencoded" },
      body: "",
    }),
  );
  expect(unknown.status).toBe(405);
  expect((await logout("/entrar", { Origin: origin })).status).toBe(405);
  vi.stubEnv("SUPABASE_PUBLISHABLE_KEY", "");
  expect((await login()).status).toBe(503);
  expect(calls).toEqual([]);
});

test("expired sessions refresh per request without leaking another account or cacheable cookies", async () => {
  expired = true;
  const [a, b] = await Promise.all([login(), login("b@example.invalid")]);
  expired = false;
  calls = [];
  const [ra, rb] = await Promise.all([load(cookie(a)), load(cookie(b))]);
  expect(ra.status).toBe(303);
  expect(rb.status).toBe(303);
  expect(calls.filter((path) => path === "/auth/v1/token")).toHaveLength(2);
  for (const response of [ra, rb]) {
    expect(response.headers.get("set-cookie")).toContain("HttpOnly");
    expect(response.headers.get("cache-control")).toContain("no-store");
  }
});
test("a deleted identity clears its session at /entrar instead of looping", async () => {
  const signed = await login();
  state = "deleted";
  const deleted = await load(cookie(signed));
  expect(deleted.status).toBe(200);
  expect(deleted.headers.get("set-cookie")).toContain("Max-Age=0");
  expect(await deleted.json()).toEqual({});
});

test("single-fetch URLs (.data) reach the same action and loader as the page", async () => {
  // O formulário hidratado posta em /entrar.data e as revalidações carregam /<rota>.data.
  const post = (path: string, password = "synthetic-password") =>
    loginAction(
      new Request(origin + path, {
        method: "POST",
        headers: { Origin: origin, "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ email: "a@example.invalid", password }),
      }),
    );
  const wrong = await post("/entrar.data", "wrong");
  expect(wrong.status).toBe(400);
  expect((await wrong.json()).error).toBe("E-mail ou senha inválidos.");
  const ok = await post("/entrar.data");
  expect(ok.status).toBe(303);
  expect(ok.headers.get("location")).toBe("/painel");
  expect((await logout("/sair.data", { Origin: origin })).status).toBe(303);
});
