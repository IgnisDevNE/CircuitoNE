import { SectionHeading } from '../../components/ui/primitives'

/** `/manifesto`: o texto completo ainda está sendo escrito; por enquanto a página avisa que vem aí. */
export function Manifesto() {
  return (
    <div>
      <SectionHeading prompt="cat" sub="O que move o circuito eletrônico do Nordeste.">manifesto</SectionHeading>
      <div className="border border-dashed border-[var(--color-line)] p-8 text-center">
        <p className="font-display text-xl font-bold text-glow sm:text-2xl">Em breve</p>
        <p className="mx-auto mt-2 max-w-md font-mono text-sm text-[var(--color-muted)]">
          Estamos escrevendo o manifesto do CircuitoNE com a cena. Volte em breve para ler o texto completo.
        </p>
      </div>
    </div>
  )
}
