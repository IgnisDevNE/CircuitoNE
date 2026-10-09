import { createServerClient, parseCookieHeader, serializeCookieHeader } from "@supabase/ssr";
import { data, type HeadersFunction } from "react-router";
import type { Database } from "../types/database.generated";

/** Per-request client: publishable key + RLS only; cookies are read from `request` and written to `headers`. */
export function createSupabaseServerClient(
  request: Request,
  headers: Headers,
  /** Uploads de até 10 MB precisam de mais que os 10 s das chamadas comuns. */
  options: { timeoutMs?: number } = {},
) {
  if (
    process.env.CIRCUITONE_RUNTIME !== "development" ||
    !process.env.SUPABASE_URL ||
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
          fetch(url, { ...init, redirect: "error", signal: AbortSignal.timeout(options.timeoutMs ?? 10000) }),
      },
    },
  );
}

export type SupabaseServerClient = ReturnType<typeof createSupabaseServerClient>;

export const privateHeaders = () =>
  new Headers({
    "Cache-Control": "private, no-store, max-age=0",
    Vary: "Cookie",
    Pragma: "no-cache",
    Expires: "0",
    "X-Content-Type-Options": "nosniff",
  });

/** Failure with an HTTP meaning (403 forbidden, 404 not found, 503 data source unavailable) and a pt-BR message. */
export class HttpError extends Error {
  constructor(
    readonly status: 403 | 404 | 503,
    message: string,
  ) {
    super(message);
  }
}

export const unavailable = () =>
  new HttpError(503, "Serviço temporariamente indisponível. Tente novamente.");

/** Unwraps a PostgREST result; any error becomes a 503 so failures never look like empty data. */
export function unwrap<T>(result: { data: T; error: unknown }): T {
  if (result.error) throw unavailable();
  return result.data;
}

/**
 * Standard loader wrapper for pages backed by Supabase: builds the per-request client,
 * returns the loaded data with private cache headers (and refreshed auth cookies), and
 * turns failures into thrown `data()` responses so SSR answers with the right HTTP status.
 *
 * `anonymous: true` ignores the visitor's cookies and queries as `anon`. Public catalogs
 * (artists) use it because for a signed-in account RLS also exposes unpublished profiles
 * (their owners' own, and basic columns of others), which must never appear in a public page.
 */
export async function supabaseLoader<T>(
  request: Request,
  load: (client: SupabaseServerClient) => Promise<T>,
  options: { anonymous?: boolean } = {},
) {
  const headers = privateHeaders();
  try {
    const source = options.anonymous ? new Request(request.url) : request;
    return data(await load(createSupabaseServerClient(source, headers)), { headers });
  } catch (error) {
    const failure = error instanceof HttpError ? error : unavailable();
    throw data({ message: failure.message }, { status: failure.status, headers });
  }
}

/** `headers` export for routes using `supabaseLoader`: forwards cache headers and Set-Cookie from loader or error. */
export const supabaseRouteHeaders: HeadersFunction = ({
  loaderHeaders,
  actionHeaders,
  errorHeaders,
}) => {
  const result = new Headers(loaderHeaders);
  for (const extra of [actionHeaders, errorHeaders]) {
    if (!extra) continue;
    for (const [name, value] of extra)
      if (name.toLowerCase() !== "set-cookie") result.set(name, value);
    for (const value of extra.getSetCookie()) result.append("Set-Cookie", value);
  }
  return result;
};
