import { ComingSoon } from '../pages/app/ComingSoon'

/** Páginas do painel ainda não ligadas ao banco; cada uma volta quando a tarefa correspondente do plano chegar. */
export const meta = () => [{ title: 'Em breve · CIRCUITO NE' }]

export default function SoonRoute() {
  return <ComingSoon />
}
