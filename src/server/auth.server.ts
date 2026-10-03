import { createServerClient, parseCookieHeader, serializeCookieHeader } from "@supabase/ssr";
import type { Database } from "../types/database.generated";

const devRef = "odphoxozclrshqjgwbqk";
const devOrigin = "https://circuitone-dev.magalz.space";
export type AccountSession = {
  id: string;
  name: string | null;
  state: "active" | "suspended" | "incomplete" | "deletion_pending";
  reason: string | null;
};
export type IdentityData = {
  preview?: boolean;
  account?: AccountSession;
  error?: string;
  email?: string;
  unavailable?: boolean;
};
const privateHeaders = () =>
  new Headers({
    "Cache-Control": "private, no-store, max-age=0",
    Vary: "Cookie",
    Pragma: "no-cache",
    Expires: "0",
  });
const reply = (data: IdentityData, status: number, headers: Headers) =>
  Response.json(data, { status, headers });
const redirect = (location: string, headers: Headers) => {
  headers.set("Location", location);
  return new Response(null, { status: 303, headers });
};

function session(request: Request, headers: Headers) {
  if (
    process.env.CIRCUITONE_RUNTIME !== "development" ||
    process.env.SUPABASE_PROJECT_REF !== devRef ||
    process.env.SUPABASE_URL !== "https://" + devRef + ".supabase.co" ||
    !process.env.SUPABASE_PUBLISHABLE_KEY?.startsWith("sb_publishable_")
  )
    throw new Error("Auth configuration unavailable");
  const cookies = new Map(
    parseCookieHeader(request.headers.get("cookie") ?? "").map(({ name, value }) => [
      name,
      value ?? "",
    ]),
  );
  return createServerClient<Database>(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_PUBLISHABLE_KEY,
    {
      cookieOptions: { httpOnly: true, secure: true, sameSite: "lax", path: "/" },
      cookies: {
        getAll: () => [...cookies].map(([name, value]) => ({ name, value })),
        setAll: (changes, cacheHeaders) => {
          for (const { name, value, options } of changes) {
            cookies.set(name, value);
            headers.append(
              "Set-Cookie",
              serializeCookieHeader(name, value, {
                ...options,
                httpOnly: true,
                secure: true,
                sameSite: "lax",
                path: "/",
              }),
            );
          }
          for (const [name, value] of Object.entries(cacheHeaders)) headers.set(name, value);
        },
      },
      global: {
        fetch: (url, init) =>
          fetch(url, { ...init, redirect: "error", signal: AbortSignal.timeout(10000) }),
      },
    },
  );
}

async function boundedForm(request: Request) {
  if (!request.headers.get("content-type")?.startsWith("application/x-www-form-urlencoded"))
    throw new Response(null, { status: 415 });
  const reader = request.body?.getReader();
  let text = "";
  let size = 0;
  const decoder = new TextDecoder();
  if (reader)
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 4096) {
        await reader.cancel();
        throw new Response(null, { status: 413 });
      }
      text += decoder.decode(value, { stream: true });
    }
  return new URLSearchParams(text + decoder.decode());
}

export async function identityLoader(request: Request): Promise<Response> {
  const headers = privateHeaders();
  const path = new URL(request.url).pathname;
  if (path === "/sair") return reply({ error: "Use o botão Sair." }, 405, headers);
  if (process.env.CIRCUITONE_RUNTIME === "preview" || !process.env.CIRCUITONE_RUNTIME)
    return reply({ preview: true }, 200, headers);
  if (path === "/cadastro") return reply({ unavailable: true }, 200, headers);
  try {
    const client = session(request, headers);
    const { data, error } = await client.auth.getUser();
    if (
      error &&
      error.name !== "AuthSessionMissingError" &&
      error.status !== 401 &&
      !["bad_jwt", "session_not_found", "refresh_token_not_found"].includes(error.code ?? "")
    )
      return reply(
        { error: "Não foi possível verificar sua sessão. Tente novamente." },
        503,
        headers,
      );
    if (!data.user)
      return path === "/entrar" ? reply({}, 200, headers) : redirect("/entrar", headers);
    const result = await client.rpc("get_account_session");
    if (result.error)
      return reply(
        { error: "Não foi possível verificar sua conta. Tente novamente." },
        503,
        headers,
      );
    if (!result.data) {
      // Invalidated identity: remove only this project's cookies, preserving Access.
      for (const { name } of parseCookieHeader(request.headers.get("cookie") ?? "")) {
        if (
          name === "sb-" + devRef + "-auth-token" ||
          name.startsWith("sb-" + devRef + "-auth-token.")
        )
          headers.append(
            "Set-Cookie",
            serializeCookieHeader(name, "", {
              path: "/",
              httpOnly: true,
              secure: true,
              sameSite: "lax",
              maxAge: 0,
            }),
          );
      }
      return path === "/entrar" ? reply({}, 200, headers) : redirect("/entrar", headers);
    }
    const account = result.data as unknown as AccountSession;
    if (
      account.id !== data.user.id ||
      !["active", "suspended", "incomplete", "deletion_pending"].includes(account.state)
    )
      return reply({ error: "Conta indisponível." }, 503, headers);
    if (path === "/entrar" && account.state === "active") return redirect("/painel", headers);
    return reply(
      { account, unavailable: path !== "/painel" },
      account.state === "active" ? 200 : 403,
      headers,
    );
  } catch {
    return reply({ error: "Serviço temporariamente indisponível. Tente novamente." }, 503, headers);
  }
}

export async function identityAction(request: Request): Promise<Response> {
  const headers = privateHeaders();
  const path = new URL(request.url).pathname;
  if (request.method !== "POST" || !["/entrar", "/sair"].includes(path))
    return reply({ error: "Operação indisponível." }, 405, headers);
  // A origem externa é fixa; não confiar em cabeçalhos forwarded fornecidos pelo cliente.
  if (
    request.headers.get("origin") !== devOrigin ||
    request.headers.get("sec-fetch-site") === "cross-site"
  )
    return reply({ error: "Origem recusada." }, 403, headers);
  try {
    const form = await boundedForm(request);
    const client = session(request, headers);
    if (path === "/sair") {
      const { error } = await client.auth.signOut({ scope: "local" });
      if (error)
        return reply(
          { error: "Não foi possível encerrar a sessão. Tente novamente." },
          503,
          headers,
        );
      return redirect("/entrar", headers);
    }
    const email = form.get("email")?.trim() ?? "";
    const password = form.get("password") ?? "";
    if (
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
      email.length > 254 ||
      !password ||
      password.length > 256
    )
      return reply({ error: "Informe e-mail e senha válidos.", email }, 400, headers);
    const { error } = await client.auth.signInWithPassword({ email, password });
    if (error)
      return reply(
        {
          error:
            error.status && error.status < 500
              ? "E-mail ou senha inválidos."
              : "Serviço temporariamente indisponível.",
          email,
        },
        error.status && error.status < 500 ? 400 : 503,
        headers,
      );
    return redirect("/painel", headers);
  } catch (error) {
    return reply(
      { error: "Não foi possível concluir a operação. Tente novamente." },
      error instanceof Response ? error.status : 503,
      headers,
    );
  }
}
