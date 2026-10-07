import { Form, Link } from 'react-router'
import { Input } from '../../components/ui/form'
import { Button, Panel } from '../../components/ui/primitives'

/** Entrada com e-mail e senha (Supabase Auth). O erro é do formulário todo (nunca diz qual dos dois campos falhou). */
export function Login({ error, email, busy }: { error?: string; email?: string; busy: boolean }) {
  return (
    <main id="conteudo" className="mx-auto min-h-screen max-w-xl px-4 py-12">
      <Link to="/" className="font-display text-xl text-[var(--accent-text)]">
        CIRCUITO_NE
      </Link>
      <div className="mt-8">
        <Panel title="entrar">
          <h1 className="mb-4 font-display text-2xl">Entrar</h1>
          {error && (
            <p id="login-error" role="alert" className="mb-4 text-[var(--accent-text)]">
              {error}
            </p>
          )}
          <Form method="post" action="/entrar" className="space-y-4" aria-describedby={error ? 'login-error' : undefined}>
            <Input
              label="E-mail"
              name="email"
              type="email"
              autoComplete="email"
              maxLength={254}
              defaultValue={email ?? ''}
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
              {busy ? 'Aguarde…' : 'Entrar'}
            </Button>
          </Form>
          <p className="mt-4 font-mono text-xs text-[var(--color-muted)]">
            Ainda não tem conta?{' '}
            <Link to="/cadastro" className="text-[var(--accent-text)] underline">
              Criar conta
            </Link>
          </p>
        </Panel>
      </div>
    </main>
  )
}
