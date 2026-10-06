import { LinkButton } from './primitives'

/** Sessão do cabeçalho público (`routes/layouts/public`); sem ela (testes de página) a ação não aparece. */
export type PublicSession = { signedIn: boolean } | null | undefined

/** "Enviar mensagem" nas páginas públicas: quem está logado compõe no painel, visitante é levado a entrar. */
export function MessageAction({ para, sessao }: { para: string; sessao: PublicSession }) {
  if (!sessao) return null
  return sessao.signedIn ? (
    <LinkButton to={`/painel/mensagens/nova?para=${para}`} variant="outline" size="sm">Enviar mensagem</LinkButton>
  ) : (
    <LinkButton to="/entrar" variant="outline" size="sm">Entrar para enviar mensagem</LinkButton>
  )
}
