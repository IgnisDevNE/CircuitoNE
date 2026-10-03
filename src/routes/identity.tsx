import {
  Form,
  Link,
  useActionData,
  useLoaderData,
  useNavigation,
  type ActionFunctionArgs,
  type LoaderFunctionArgs,
  type HeadersFunction,
} from "react-router";
import LegacyRoute from "./legacy";
import { Input } from "../components/ui/form";
import { Button, Panel } from "../components/ui/primitives";
import { identityAction, identityLoader, type IdentityData } from "../server/auth.server";

export const loader = ({ request }: LoaderFunctionArgs) => identityLoader(request);
export const action = ({ request }: ActionFunctionArgs) => identityAction(request);
export const headers: HeadersFunction = ({ loaderHeaders, actionHeaders }) => {
  const result = new Headers(loaderHeaders);
  for (const [name, value] of actionHeaders)
    if (name.toLowerCase() !== "set-cookie") result.set(name, value);
  for (const value of actionHeaders.getSetCookie()) result.append("Set-Cookie", value);
  return result;
};
export const meta = () => [{ title: "Minha conta · CIRCUITO NE" }];

export default function IdentityPage() {
  const data = useLoaderData<IdentityData>();
  const submitted = useActionData<IdentityData>();
  const busy = useNavigation().state !== "idle";
  if (data.preview) return <LegacyRoute />;
  const error = submitted?.error ?? data.error;
  const account = data.account;
  return (
    <main className="mx-auto min-h-screen max-w-xl px-4 py-12">
      <Link to="/" className="font-display text-xl text-[var(--accent-text)]">
        CIRCUITO_NE
      </Link>
      <div className="mt-8">
        <Panel title={account ? "Minha conta" : "Entrar"}>
          {error && (
            <p role="alert" className="mb-4 text-[var(--accent-text)]">
              {error}
            </p>
          )}
          {account ? (
            <div className="space-y-4">
              <h1 className="font-display text-2xl">{account.name ?? "Minha conta"}</h1>
              {account.state === "suspended" ? (
                <>
                  <p>Conta suspensa para revisão.</p>
                  <p>{account.reason}</p>
                </>
              ) : account.state === "deletion_pending" ? (
                <p>A exclusão da sua conta está em análise. As operações estão bloqueadas.</p>
              ) : account.state === "incomplete" ? (
                <p>
                  Seu cadastro ou a confirmação dos contatos precisa ser concluído antes de usar o
                  portal.
                </p>
              ) : (
                <p>
                  {data.unavailable
                    ? "Esta função ainda está em preparação."
                    : "Você entrou na sua conta. As demais funções do portal estão em preparação."}
                </p>
              )}
              <a
                className="block text-[var(--accent-text)] underline"
                href="mailto:ignisdev@magalz.space"
              >
                Contatar suporte
              </a>
              <Form method="post" action="/sair">
                <Button type="submit" disabled={busy}>
                  {busy ? "Aguarde…" : "Sair"}
                </Button>
              </Form>
            </div>
          ) : data.unavailable ? (
            <>
              <h1 className="text-xl">Cadastro em preparação</h1>
              <p className="my-4">O cadastro ainda não está disponível.</p>
              <Link to="/entrar">Entrar</Link>
            </>
          ) : (
            <>
              <h1 className="mb-4 font-display text-2xl">Entrar</h1>
              <Form method="post" action="/entrar" className="space-y-4">
                <Input
                  label="E-mail"
                  name="email"
                  type="email"
                  autoComplete="email"
                  maxLength={254}
                  defaultValue={submitted?.email ?? ""}
                  required
                />
                <Input
                  label="Senha"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  maxLength={256}
                  required
                />
                <Button type="submit" variant="solid" disabled={busy}>
                  {busy ? "Aguarde…" : "Entrar"}
                </Button>
              </Form>
            </>
          )}
        </Panel>
      </div>
    </main>
  );
}
