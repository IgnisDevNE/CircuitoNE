import { useEffect } from 'react'
import { useParams } from '../../router'
import { useStore } from '../../context/StoreContext'
import { usePageTitle } from '../../lib/usePageTitle'
import { useColetivo } from '../../components/layout/CollectiveLayout'
import { Empty, Panel } from '../../components/ui/primitives'
import { Chat } from '../../components/ui/Chat'

export function CollectiveMessages() {
  const { id } = useParams()
  const { col, nivel } = useColetivo(id)
  const { threads, markThreadRead } = useStore()
  usePageTitle(col ? `${col.nome} · Mensagens` : 'Mensagens')

  const colThreads = threads.filter((t) => t.coletivoId === id)
  const active = colThreads[0]

  useEffect(() => {
    if (col && nivel >= 1 && active) markThreadRead(active.id)
  }, [col, nivel, active?.id, markThreadRead])

  if (!col) return null
  if (nivel < 1) return <Empty>Você não tem permissão para ver as mensagens deste coletivo (requer nível 1+).</Empty>

  return (
    <Panel title="chat do coletivo" className="flex h-[70vh] flex-col" bodyClassName="flex min-h-0 flex-1 flex-col">
      {active ? <Chat key={active.id} thread={active} /> : <Empty>Sem conversas neste coletivo.</Empty>}
    </Panel>
  )
}
