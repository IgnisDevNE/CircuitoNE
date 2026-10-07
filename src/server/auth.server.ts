import { parseCookieHeader, serializeCookieHeader } from "@supabase/ssr";
import type { User } from "@supabase/supabase-js";
import {
  createSupabaseServerClient,
  privateHeaders,
  type SupabaseServerClient,
} from "./supabase.server";

export type AccountSession = {
  id: string;
  name: string | null;
  state: "active" | "suspended" | "incomplete" | "deletion_pending";
  reason: string | null;
};
/** Resposta do loader e da ação de `/entrar`: só a mensagem de erro e o e-mail digitado (nunca a senha). */
export type LoginData = {
  error?: string;
  email?: string;
};
const reply = (data: LoginData, status: number, headers: Headers) =>
  Response.json(data, { status, headers });
const redirect = (location: string, headers: Headers) => {
  headers.set("Location", location);
  return new Response(null, { status: 303, headers });
};

/** Form body parsed with a size cap (4 KiB by default); other types or larger bodies are rejected with 415/413. */
export async function boundedForm(request: Request, limit = 4096) {
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
      if (size > limit) {
        await reader.cancel();
        throw new Response(null, { status: 413 });
      }
      text += decoder.decode(value, { stream: true });
    }
  return new URLSearchParams(text + decoder.decode());
}

/** Uploaded files by field name; empty file parts (a file input left blank) are dropped. */
export type UploadedFiles = Map<string, File>

/** How much of an oversized upload is read and thrown away before the connection is dropped (see `boundedMultipart`). */
const DRAIN_BYTES = 50_000_000;

export const isMultipart = (request: Request) =>
  !!request.headers.get("content-type")?.toLowerCase().startsWith("multipart/form-data");

/**
 * Multipart body read with a hard size cap (so an oversized upload is cut off instead of buffered), then parsed:
 * text fields become a `URLSearchParams` (same shape as `boundedForm`) and files a map by field name.
 * Larger bodies are rejected with 413 and malformed ones with 415.
 */
export async function boundedMultipart(
  request: Request,
  limit: number,
): Promise<{ form: URLSearchParams; files: UploadedFiles }> {
  const contentType = request.headers.get("content-type") ?? "";
  // Past the limit the body is still read (and discarded, never buffered) up to a hard cap, so the browser finishes its
  // send and can show the 413 message; cutting the connection mid-upload would only show a network error. Beyond the
  // cap, or when the declared length is already beyond it, the stream is dropped.
  const hardCap = limit + DRAIN_BYTES;
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > hardCap) throw new Response(null, { status: 413 });
  const reader = request.body?.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  if (reader)
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > hardCap) {
        await reader.cancel();
        throw new Response(null, { status: 413 });
      }
      if (size <= limit) chunks.push(value);
    }
  if (size > limit) throw new Response(null, { status: 413 });
  let parsed: FormData;
  try {
    parsed = await new Response(new Blob(chunks as BlobPart[]), {
      headers: { "content-type": contentType },
    }).formData();
  } catch {
    throw new Response(null, { status: 415 });
  }
  const form = new URLSearchParams();
  const files: UploadedFiles = new Map();
  for (const [name, value] of parsed) {
    if (typeof value === "string") form.append(name, value);
    else if (value.size > 0 && !files.has(name)) files.set(name, value);
  }
  return { form, files };
}

/** Body of a write action: urlencoded (`limit`) always, multipart (`uploadLimit`) only where uploads are expected. */
export async function boundedBody(
  request: Request,
  limits: { limit?: number; uploadLimit?: number } = {},
): Promise<{ form: URLSearchParams; files: UploadedFiles }> {
  if (isMultipart(request)) {
    if (!limits.uploadLimit) throw new Response(null, { status: 415 });
    return boundedMultipart(request, limits.uploadLimit);
  }
  return { form: await boundedForm(request, limits.limit), files: new Map() };
}

/** Pathname of the page, without the `.data` suffix that single-fetch (client-side form posts and loads) appends. */
export const routePath = (request: Request) => new URL(request.url).pathname.replace(/\.data$/, "");

const states = ["active", "suspended", "incomplete", "deletion_pending"];

/** True when the request carries Supabase auth cookies for any project (sb-<ref>-auth-token[.n]). */
export const hasAuthCookie = (request: Request) =>
  parseCookieHeader(request.headers.get("cookie") ?? "").some(({ name }) =>
    /^sb-[^=]+-auth-token(\.\d+)?$/.test(name),
  );

export type SessionResult =
  | { kind: "anonymous" }
  | { kind: "account"; account: AccountSession; user: User }
  | { kind: "error"; message: string };

/**
 * Server-side session check shared by every private route: `getUser()` validates the JWT with Auth
 * (never `getSession()` or user_metadata) and `get_account_session` returns the application state.
 * An invalidated identity clears this project's auth cookies (into `headers`) and counts as anonymous.
 */
export async function readAccountSession(
  client: SupabaseServerClient,
  request: Request,
  headers: Headers,
): Promise<SessionResult> {
  const { data, error } = await client.auth.getUser();
  if (
    error &&
    error.name !== "AuthSessionMissingError" &&
    error.status !== 401 &&
    !["bad_jwt", "session_not_found", "refresh_token_not_found"].includes(error.code ?? "")
  )
    return { kind: "error", message: "Não foi possível verificar sua sessão. Tente novamente." };
  if (!data.user) return { kind: "anonymous" };
  const result = await client.rpc("get_account_session");
  if (result.error)
    return { kind: "error", message: "Não foi possível verificar sua conta. Tente novamente." };
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
    return { kind: "anonymous" };
  }
  const account = result.data as unknown as AccountSession;
  if (account.id !== data.user.id || !states.includes(account.state))
    return { kind: "error", message: "Conta indisponível." };
  return { kind: "account", account, user: data.user };
}

/**
 * Loader de `/entrar`: quem já tem conta (ativa ou não) segue para `/painel`, onde o layout autenticado mostra o painel
 * ou o aviso da conta restrita; visitante vê o formulário. Uma identidade invalidada limpa os cookies e conta como visitante.
 */
export async function loginLoader(request: Request): Promise<Response> {
  const headers = privateHeaders();
  try {
    const client = createSupabaseServerClient(request, headers);
    const session = await readAccountSession(client, request, headers);
    if (session.kind === "error") return reply({ error: session.message }, 503, headers);
    if (session.kind === "account") return redirect("/painel", headers);
    return reply({}, 200, headers);
  } catch {
    return reply({ error: "Serviço temporariamente indisponível. Tente novamente." }, 503, headers);
  }
}

/** `GET /sair` não encerra nada (só o POST encerra): volta para o formulário de entrada. */
export const logoutLoader = () => {
  const headers = privateHeaders();
  return redirect("/entrar", headers);
};

/** Mesma guarda das demais ações: a origem externa vem da configuração, nunca de cabeçalhos forwarded do cliente. */
const originAllowed = (request: Request) =>
  !!process.env.APP_ORIGIN &&
  request.headers.get("origin") === process.env.APP_ORIGIN &&
  request.headers.get("sec-fetch-site") !== "cross-site";

export async function loginAction(request: Request): Promise<Response> {
  const headers = privateHeaders();
  if (request.method !== "POST" || routePath(request) !== "/entrar")
    return reply({ error: "Operação indisponível." }, 405, headers);
  if (!originAllowed(request)) return reply({ error: "Origem recusada." }, 403, headers);
  try {
    const form = await boundedForm(request);
    const client = createSupabaseServerClient(request, headers);
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

export async function logoutAction(request: Request): Promise<Response> {
  const headers = privateHeaders();
  if (request.method !== "POST" || routePath(request) !== "/sair")
    return reply({ error: "Operação indisponível." }, 405, headers);
  if (!originAllowed(request)) return reply({ error: "Origem recusada." }, 403, headers);
  try {
    await boundedForm(request);
    const client = createSupabaseServerClient(request, headers);
    const { error } = await client.auth.signOut({ scope: "local" });
    if (error)
      return reply(
        { error: "Não foi possível encerrar a sessão. Tente novamente." },
        503,
        headers,
      );
    return redirect("/entrar", headers);
  } catch (error) {
    return reply(
      { error: "Não foi possível concluir a operação. Tente novamente." },
      error instanceof Response ? error.status : 503,
      headers,
    );
  }
}
