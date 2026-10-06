import { MessagesWorkspace, type MessagesWorkspaceProps } from '../../components/ui/MessagesWorkspace'

export interface CollectiveMessagesProps extends Omit<MessagesWorkspaceProps, 'basePath' | 'novaHref'> {
  coletivoId: string
}

/** Conversas em que o coletivo é um dos lados; ler e enviar dependem de permissões diferentes. */
export function CollectiveMessages({ coletivoId, ...props }: CollectiveMessagesProps) {
  return (
    <div className="space-y-4">
      <h2 className="font-display text-xl font-bold">chat do coletivo</h2>
      <MessagesWorkspace {...props} basePath={`/coletivo/${coletivoId}/mensagens`} />
    </div>
  )
}
