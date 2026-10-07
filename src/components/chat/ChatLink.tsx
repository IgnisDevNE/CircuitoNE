import type { MouseEvent } from 'react'
import { Link } from 'react-router'
import { btnClass } from '../ui/primitives'
import { useChatDock } from './ChatDockProvider'

/**
 * "Enviar mensagem": abre a janela de conversa no canto da tela, sem navegar. O `href` continua sendo a tela completa de nova
 * mensagem, que atende quem abre em outra aba (clique do meio, Ctrl/Cmd+clique), quem ainda não carregou o JavaScript e as
 * páginas renderizadas sem o chat (testes isolados). Um link, e não um botão, justamente por esse caminho alternativo.
 */
export function ChatLink({ para }: { para: string }) {
  const dock = useChatDock()
  const onClick = (event: MouseEvent<HTMLAnchorElement>) => {
    if (!dock || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
    event.preventDefault()
    dock.open(para, event.currentTarget)
  }
  return (
    <Link to={`/painel/mensagens/nova?para=${para}`} onClick={onClick} aria-haspopup="dialog" className={btnClass('outline', 'sm')}>
      Enviar mensagem
    </Link>
  )
}
