import { useState } from 'react'
import { useStore } from '../../context/StoreContext'
import { useToast } from '../../context/ToastContext'
import { usePageTitle } from '../../lib/usePageTitle'
import { Button, Panel } from '../../components/ui/primitives'
import { Input } from '../../components/ui/form'

export function Security() {
  usePageTitle('Segurança')
  const { user, updateUser } = useStore()
  const toast = useToast()
  const [email, setEmail] = useState(user?.email ?? '')
  const [senha, setSenha] = useState({ atual: '', nova: '', conf: '' })
  const [err, setErr] = useState<Record<string, string>>({})

  if (!user) return null

  const salvarEmail = (e: React.FormEvent) => {
    e.preventDefault()
    updateUser({ email })
    toast('E-mail atualizado', 'ok')
  }
  const salvarSenha = (e: React.FormEvent) => {
    e.preventDefault()
    const errs: Record<string, string> = {}
    if (!senha.atual) errs.atual = 'Informe a senha atual.'
    if (senha.nova.length < 8) errs.nova = 'Mínimo de 8 caracteres.'
    if (senha.nova !== senha.conf) errs.conf = 'As senhas não coincidem.'
    setErr(errs)
    if (Object.keys(errs).length) { toast('Verifique os campos', 'warn'); return }
    setSenha({ atual: '', nova: '', conf: '' })
    toast('Senha alterada com sucesso', 'ok')
  }

  return (
    <div className="max-w-xl space-y-6">
      <h1 className="font-display text-2xl font-bold text-glow">$ seguranca</h1>

      <Panel title="alterar e-mail">
        <form onSubmit={salvarEmail} className="space-y-4" noValidate>
          <Input label="E-mail" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
          <Button type="submit" variant="solid">salvar e-mail</Button>
        </form>
      </Panel>

      <Panel title="alterar senha">
        <form onSubmit={salvarSenha} className="space-y-4" noValidate>
          <Input label="Senha atual" type="password" value={senha.atual} onChange={(e) => setSenha({ ...senha, atual: e.target.value })} error={err.atual} autoComplete="current-password" />
          <Input label="Nova senha" type="password" value={senha.nova} onChange={(e) => setSenha({ ...senha, nova: e.target.value })} error={err.nova} hint="mínimo 8 caracteres" autoComplete="new-password" />
          <Input label="Confirmar nova senha" type="password" value={senha.conf} onChange={(e) => setSenha({ ...senha, conf: e.target.value })} error={err.conf} autoComplete="new-password" />
          <Button type="submit" variant="solid">alterar senha</Button>
        </form>
      </Panel>
    </div>
  )
}
