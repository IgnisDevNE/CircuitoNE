import { useRouteLoaderData, type MetaFunction } from 'react-router'
import { artistas, coletivos, eventos } from '../data/mock'
import App from '../App'
import type { loader as rootLoader } from '../root'

export default function LegacyRoute() {
  const data = useRouteLoaderData<typeof rootLoader>('root')
  return <App initialNow={data?.renderedAt} />
}

const titles: Record<string, string> = {
  '/': 'Início', '/artistas': 'Artistas', '/coletivos': 'Coletivos e Produtoras',
  '/eventos': 'Eventos Programados', '/entrar': 'Entrar', '/cadastro': 'Cadastro',
  '/painel': 'Dashboard', '/painel/dados': 'Editar Dados',
  '/painel/dados/nova-atuacao': 'Nova atuação', '/painel/seguranca': 'Segurança',
  '/painel/mensagens': 'Central de Mensagens', '/painel/coletivos': 'Meus Coletivos',
  '/painel/explorar/artistas': 'explorar/artistas',
  '/painel/explorar/servicos': 'explorar/serviços',
  '/painel/explorar/audiovisual': 'explorar/audiovisual',
  '/painel/explorar/coletivos': 'explorar/coletivos',
}

export const meta: MetaFunction = ({ location }) => {
  const path = location.pathname
  let title = titles[path]
  if (path.startsWith('/artistas/')) title = artistas.find((item) => path === `/artistas/${item.id}`)?.nome ?? 'Artista'
  if (path.startsWith('/coletivos/')) title = coletivos.find((item) => path === `/coletivos/${item.id}`)?.nome ?? 'Coletivo'
  if (path.startsWith('/eventos/')) title = eventos.find((item) => path === `/eventos/${item.id}`)?.nome ?? 'Evento'
  if (path.startsWith('/painel/perfil/')) title = `Editar ${artistas.find((item) => path === `/painel/perfil/${item.id}`)?.nome ?? 'Perfil'}`
  if (path.startsWith('/coletivo/')) {
    const [, , id, section, detail] = path.split('/')
    const name = coletivos.find((item) => item.id === id)?.nome ?? 'Coletivo'
    const sectionTitle: Record<string, string> = {
      painel: 'Dashboard', mensagens: 'Mensagens', solicitacoes: 'Solicitações',
      membros: 'Membros', editar: 'Editar', perfil: 'Perfil',
    }
    title = `${name} · ${detail === 'novo' ? 'Criar Evento' : sectionTitle[section] ?? 'Coletivo'}`
  }
  return [
    { title: `${title ?? 'CircuitoNE'} · CIRCUITO NE` },
    { name: 'description', content: 'CircuitoNE: artistas, coletivos, eventos e profissionais da cena eletrônica.' },
  ]
}
