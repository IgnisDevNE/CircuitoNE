import { MessagesWorkspace, type MessagesWorkspaceProps } from '../../components/ui/MessagesWorkspace'

export type MessagesProps = Omit<MessagesWorkspaceProps, 'basePath' | 'novaHref'>

/** Central de mensagens da conta: conversas das atuações do titular. */
export function Messages(props: MessagesProps) {
  return (
    <div className="space-y-6">
      <h1 className="font-display text-2xl font-bold text-glow">$ central_de_mensagens</h1>
      <MessagesWorkspace {...props} basePath="/painel/mensagens" novaHref="/painel/mensagens/nova" />
    </div>
  )
}
