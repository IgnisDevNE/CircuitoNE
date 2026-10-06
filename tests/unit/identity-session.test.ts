// @vitest-environment node
import { beforeEach, afterEach, expect, test, vi } from "vitest";
import { identityLoader, identityAction } from "../../src/server/auth.server";

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
  identityAction(
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
const load = (cookies = "", path = "/painel") =>
  identityLoader(new Request(origin + path, { headers: { Cookie: cookies } }));

test("visitor redirects and incorrect credentials never create a session", async () => {
  const visitor = await load();
  expect(visitor.status).toBe(303);
  expect(visitor.headers.get("location")).toBe("/entrar");
  const wrong = await login("a@example.invalid", "wrong");
  expect(wrong.status).toBe(400);
  expect((await wrong.json()).error).toBeTruthy();
  expect(cookie(wrong)).toBe("");
});
test("real provider login survives SSR reload and two simultaneous accounts stay isolated", async () => {
  const [a, b] = await Promise.all([login(), login("b@example.invalid")]);
  expect(a.status).toBe(303);
  expect(b.status).toBe(303);
  const [ra, rb] = await Promise.all([load(cookie(a)), load(cookie(b))]);
  expect((await ra.json()).account).toEqual(accounts.A);
  expect((await rb.json()).account).toEqual(accounts.B);
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
  }
  expect(calls).toEqual([]);
  const getLogout = await load("", "/sair");
  expect(getLogout.status).toBe(405);
});
test("logout clears cookies and is a POST protected by origin", async () => {
  const signed = await login();
  const signedCookie = cookie(signed);
  const response = await identityAction(
    new Request(origin + "/sair", {
      method: "POST",
      headers: {
        Origin: origin,
        Cookie: signedCookie,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: "",
    }),
  );
  expect(response.status).toBe(303);
  expect(response.headers.get("location")).toBe("/entrar");
  expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
  expect(calls).toContain("/auth/v1/logout");
});
test("suspended, incomplete, deletion pending and deleted identities get no active area or mock identity", async () => {
  const signed = await login();
  for (const value of ["suspended", "incomplete", "deletion_pending"]) {
    state = value;
    const response = await load(cookie(signed), "/painel/mensagens");
    expect(response.status).toBe(403);
    const data = await response.json();
    expect(data.account.state).toBe(value);
    expect(JSON.stringify(data)).not.toContain("UNTRUSTED");
  }
  state = "deleted";
  const response = await load(cookie(signed));
  expect(response.status).toBe(303);
});
test("provider failure fails closed with no credentials in the response", async () => {
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("private provider error")));
  const response = await login();
  expect(response.status).toBe(503);
  expect(await response.text()).not.toContain("synthetic-password");
});
test("oversized forms, unknown mutations and wrong destination cannot reach Auth", async () => {
  expect((await login("a@example.invalid", "x".repeat(5000))).status).toBe(413);
  const unknown = await identityAction(
    new Request(origin + "/painel", {
      method: "POST",
      headers: { Origin: origin, "Content-Type": "application/x-www-form-urlencoded" },
      body: "",
    }),
  );
  expect(unknown.status).toBe(405);
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
  expect((await ra.json()).account).toEqual(accounts.A);
  expect((await rb.json()).account).toEqual(accounts.B);
  expect(calls.filter((path) => path === "/auth/v1/token")).toHaveLength(2);
  for (const response of [ra, rb]) {
    expect(response.headers.get("set-cookie")).toContain("HttpOnly");
    expect(response.headers.get("cache-control")).toContain("no-store");
  }
});
test("restricted identity sees reason at login and deleted identity clears its session instead of looping", async () => {
  const signed = await login();
  state = "suspended";
  const restricted = await load(cookie(signed), "/entrar");
  expect(restricted.status).toBe(403);
  expect((await restricted.json()).account.state).toBe("suspended");
  state = "deleted";
  const deleted = await load(cookie(signed), "/entrar");
  expect(deleted.status).toBe(200);
  expect(deleted.headers.get("set-cookie")).toContain("Max-Age=0");
  expect((await deleted.json()).account).toBeUndefined();
});

test('public fixture routes remain available without an Auth session in development',async()=>{
 const response=await load('','/eventos/ev-porto');expect(response.status).toBe(200);expect((await response.json()).preview).toBe(true);expect(calls).toEqual([])
})
