import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { validateRuntimeEnv } from "./start-runtime.mjs";

const ref = "odphoxozclrshqjgwbqk";
const origin = "https://circuitone-dev.magalz.space";
const reserved = [1, 5].map((n) => "01000000-0000-4000-8000-" + String(n).padStart(12, "0"));
function verifyIdentities(identities) {
  assert.equal(identities?.length, 2, "Two reserved synthetic sessions required");
  assert.deepEqual(
    identities.map((identity) => identity.id),
    reserved,
  );
  for (const identity of identities) {
    assert.ok(
      typeof identity.name === "string" && identity.name.length > 0 && identity.name.length <= 200,
      "Synthetic name required",
    );
    for (const key of ["access_token", "refresh_token"])
      assert.ok(
        typeof identity[key] === "string" &&
          identity[key].length > 0 &&
          identity[key].length <= 12000,
        "Synthetic session required",
      );
  }
}

export async function checkHomologationSsr(env, identities, run = spawnSync) {
  assert.equal(env.SUPABASE_PROJECT_REF, ref);
  assert.equal(env.SUPABASE_URL, "https://" + ref + ".supabase.co");
  assert.ok(env.SUPABASE_PUBLISHABLE_KEY?.startsWith("sb_publishable_"));
  verifyIdentities(identities);
  const input = JSON.stringify(identities);
  assert.ok(Buffer.byteLength(input) <= 32768, "Oversized synthetic session input");
  // Application/build never inherit maintenance credentials or Node preload options.
  const publicEnv = {
    PATH: env.PATH ?? "/usr/local/bin:/usr/bin:/bin",
    NODE_ENV: "production",
    CIRCUITONE_RUNTIME: "development",
    DEMO_MODE: "true",
    SUPABASE_PROJECT_REF: ref,
    SUPABASE_URL: env.SUPABASE_URL,
    SUPABASE_PUBLISHABLE_KEY: env.SUPABASE_PUBLISHABLE_KEY,
  };
  const options = {
    env: publicEnv,
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
    timeout: 180000,
    maxBuffer: 1024 * 1024,
  };
  const build = run(process.execPath, ["node_modules/@react-router/dev/bin.cjs", "build"], options);
  if (build.error || build.status !== 0) throw Error("SSR build failed");
  const worker = run(process.execPath, ["scripts/homologation-ssr.mjs", "--worker"], {
    ...options,
    input,
    timeout: 120000,
    maxBuffer: 8192,
  });
  if (worker.error || worker.status !== 0 || worker.stdout !== "SSR_AUTH_OK\n" || worker.stderr)
    throw Error("Real SSR session verification failed");
}

export async function verifySsrSessions(handler, identities) {
  const { createServerClient, serializeCookieHeader } = await import("@supabase/ssr");
  verifyIdentities(identities);
  assert.notEqual(
    identities[0].name,
    identities[1].name,
    "Synthetic identities must be distinguishable",
  );
  const jars = [];
  for (const identity of identities) {
    const jar = new Map();
    const client = createServerClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_PUBLISHABLE_KEY,
      {
        cookieOptions: { httpOnly: true, secure: true, sameSite: "lax", path: "/" },
        cookies: {
          getAll: () => [...jar].map(([name, value]) => ({ name, value })),
          setAll: (changes) => {
            for (const { name, value, options } of changes) {
              const cookie = serializeCookieHeader(name, value, options);
              for (const flag of [/HttpOnly/, /Secure/, /SameSite=Lax/]) assert.match(cookie, flag);
              jar.set(name, value);
            }
          },
        },
        global: {
          fetch: (url, init) =>
            fetch(url, { ...init, redirect: "error", signal: AbortSignal.timeout(10000) }),
        },
      },
    );
    const result = await client.auth.setSession({
      access_token: identity.access_token,
      refresh_token: identity.refresh_token,
    });
    assert.ok(
      !result.error && result.data.user?.id === identity.id,
      "Reserved session verification failed",
    );
    assert.ok(jar.size > 0, "SDK must create session cookies");
    jars.push(jar);
  }
  const cookie = (index) => [...jars[index]].map(([name, value]) => name + "=" + value).join("; ");
  const privateResponse = (response) => {
    assert.match(response.headers.get("cache-control") ?? "", /no-store/);
    assert.ok(
      (response.headers.get("vary") ?? "")
        .toLowerCase()
        .split(",")
        .map((value) => value.trim())
        .includes("cookie"),
      "Private response must vary on Cookie",
    );
  };
  const visitor = await handler(new Request(origin + "/painel"));
  assert.equal(visitor.status, 303);
  assert.equal(visitor.headers.get("location"), "/entrar");
  privateResponse(visitor);
  const account = async (index, path) => {
    const response = await handler(
      new Request(origin + path, { headers: { Cookie: cookie(index) } }),
    );
    assert.equal(response.status, 200);
    privateResponse(response);
    const body = await response.text();
    assert.ok(body.includes(identities[index].name), "SSR must render the correct account");
    assert.ok(!body.includes(identities[1 - index].name), "SSR must not mix accounts");
    for (const identity of identities)
      for (const key of ["access_token", "refresh_token"])
        assert.ok(!body.includes(identity[key]), "SSR must not serialize session tokens");
  };
  // Concurrent accounts, followed by fresh Requests for reload and Framework data.
  await Promise.all([account(0, "/painel"), account(1, "/painel")]);
  for (const path of ["/painel", "/painel.data"])
    await Promise.all([account(0, path), account(1, path)]);
  const logout = await handler(
    new Request(origin + "/sair", {
      method: "POST",
      headers: {
        Origin: origin,
        Cookie: cookie(0),
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: "",
    }),
  );
  assert.equal(logout.status, 303);
  assert.equal(logout.headers.get("location"), "/entrar");
  privateResponse(logout);
  const cleared = logout.headers.getSetCookie();
  assert.ok(cleared.length > 0, "Logout must clear cookies");
  for (const value of cleared) {
    for (const flag of [/HttpOnly/, /Secure/, /SameSite=Lax/, /Max-Age=0/])
      assert.match(value, flag);
    jars[0].delete(value.split("=", 1)[0]);
  }
  assert.equal(jars[0].size, 0, "Logout must clear every session chunk");
  const gone = await handler(new Request(origin + "/painel", { headers: { Cookie: cookie(0) } }));
  assert.equal(gone.status, 303);
  assert.equal(gone.headers.get("location"), "/entrar");
  await account(1, "/painel");
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    assert.equal(process.argv.length, 3);
    assert.equal(process.argv[2], "--worker");
    assert.equal(validateRuntimeEnv(process.env), "development");
    const chunks = [];
    let size = 0;
    for await (const chunk of process.stdin) {
      size += chunk.length;
      assert.ok(size <= 32768, "Oversized input");
      chunks.push(chunk);
    }
    const identities = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    const { createRequestHandler } = await import("react-router");
    const build = await import("../build/server/index.js");
    await verifySsrSessions(createRequestHandler(build, "production"), identities);
    console.log("SSR_AUTH_OK");
  } catch {
    // Never relay provider errors, HTML, cookies or tokens to the protected log.
    console.error("Real SSR session check failed");
    process.exitCode = 1;
  }
}
