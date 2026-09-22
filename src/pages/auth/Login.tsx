import { useState } from 'react'
import { Link, useNavigate } from '../../router'
import { useStore } from '../../context/StoreContext'
import { usePageTitle } from '../../lib/usePageTitle'
import { Button, Panel } from '../../components/ui/primitives'
import { Input } from '../../components/ui/form'
import { BootLog, Cursor } from '../../components/ui/anim'
import { useToast } from '../../context/ToastContext'

export function Login() {
  usePageTitle('Entrar')
  const { login } = useStore()
  const navigate = useNavigate()
  const toast = useToast()
  const [email, setEmail] = useState('ana@cena.ne')
  const [senha, setSenha] = useState('demo1234')

  const entrar = (e: React.FormEvent) => {
    e.preventDefault()
    login()
    toast('Sessão iniciada como Ana Ribeiro (demo)', 'ok')
    navigate('/painel')
  }

  return (
    <div className="mx-auto grid max-w-4xl gap-8 py-8 lg:grid-cols-2 lg:items-center">
      <div>
        <h1 className="font-display text-3xl font-bold text-glow">
          acesso<span className="text-[var(--accent-text)]">_</span>terminal<Cursor />
        </h1>
        <p className="mt-3 max-w-sm font-mono text-sm text-[var(--color-muted)]">
          Este é um protótipo. Use qualquer credencial ou o botão de demo para entrar como <strong className="text-[var(--foreground)]">Ana Ribeiro</strong>, que possui múltiplas atuações.
        </p>
        <BootLog className="mt-6 border border-[var(--color-line)] p-4" lines={['handshake…', 'verificando chaves…', 'sessão pronta ✓']} />
      </div>

      <Panel title="login">
        <form onSubmit={entrar} className="space-y-4" noValidate>
          <Input label="E-mail" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
          <Input label="Senha" type="password" value={senha} onChange={(e) => setSenha(e.target.value)} required autoComplete="current-password" />
          <Button type="submit" variant="solid" className="w-full">Entrar</Button>
          <Button type="button" variant="outline" className="w-full" onClick={entrar}>[demo] entrar como Ana</Button>
          <p className="text-center font-mono text-xs text-[var(--color-muted)]">
            Sem conta? <Link to="/cadastro" className="text-[var(--accent-text)] hover:underline">cadastre-se →</Link>
          </p>
        </form>
      </Panel>
    </div>
  )
}
