import { parseCookieHeader, serializeCookieHeader } from "@supabase/ssr";
import { createSupabaseServerClient, privateHeaders } from "./supabase.server";

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
const reply = (data: IdentityData, status: number, headers: Headers) =>
  Response.json(data, { status, headers });
const redirect = (location: string, headers: Headers) => {
  headers.set("Location", location);
  return new Response(null, { status: 303, headers });
};

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
  if (process.env.CIRCUITONE_RUNTIME !== 'development') return reply({error:'Serviço indisponível.'},503,headers)
  if (path !== '/entrar' && path !== '/cadastro' && !path.startsWith('/painel') && !path.startsWith('/coletivo/')) return reply({preview:true},200,headers)
  if (path === "/cadastro") return reply({ unavailable: true }, 200, headers);
  try {
    const client = createSupabaseServerClient(request, headers);
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
      const authCookie =
        "sb-" + new URL(process.env.SUPABASE_URL!).hostname.split(".")[0] + "-auth-token";
      for (const { name } of parseCookieHeader(request.headers.get("cookie") ?? "")) {
        if (name === authCookie || name.startsWith(authCookie + "."))
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
  // A origem externa vem da configuração; não confiar em cabeçalhos forwarded do cliente.
  if (
    !process.env.APP_ORIGIN ||
    request.headers.get("origin") !== process.env.APP_ORIGIN ||
    request.headers.get("sec-fetch-site") === "cross-site"
  )
    return reply({ error: "Origem recusada." }, 403, headers);
  try {
    const form = await boundedForm(request);
    const client = createSupabaseServerClient(request, headers);
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
