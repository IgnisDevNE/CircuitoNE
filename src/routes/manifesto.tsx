import { Manifesto } from '../pages/public/Manifesto'

export const meta = () => [
  { title: 'Manifesto · CIRCUITO NE' },
  { name: 'description', content: 'O manifesto do CircuitoNE, hub independente da cena eletrônica do Nordeste: em breve.' },
]

export default function ManifestoRoute() {
  return <Manifesto />
}
