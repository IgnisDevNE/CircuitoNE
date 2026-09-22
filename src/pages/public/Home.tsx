import { Link } from '../../router'
import { useStore } from '../../context/StoreContext'
import { usePageTitle } from '../../lib/usePageTitle'
import { fmtData, isFuturo, porProximidade, tipoEventoLabel } from '../../lib/utils'
import { BootLog, Cursor, GlitchText, ScanBeam, TypeText } from '../../components/ui/anim'
import { Badge, LinkButton, SectionHeading } from '../../components/ui/primitives'
import { DuotoneImage } from '../../components/ui/DuotoneImage'
import { AccentScope } from '../../components/ui/AccentScope'

export function Home() {
  usePageTitle('Início')
  const { artistas, coletivos, eventos } = useStore()
  const proximos = [...eventos].filter((e) => isFuturo(e.inicio)).sort(porProximidade).slice(0, 3)

  return (
    <div className="space-y-16">
      {/* HERO */}
      <section className="relative overflow-hidden neon-border scanlines">
        <ScanBeam />
        <div className="grid gap-8 p-6 sm:p-10 lg:grid-cols-[1.2fr_1fr] lg:items-center">
          <div>
            <p className="mb-4 font-mono text-xs uppercase tracking-[0.3em] text-[var(--accent-text)]">
              conectando a cena eletrônica do nordeste
            </p>
            <h1 className="font-display text-4xl font-bold leading-[1.05] tracking-tight text-glow sm:text-6xl">
              <GlitchText>CIRCUITO</GlitchText>
              <span className="text-[var(--accent-text)]">_</span>NE
              <Cursor />
            </h1>
            <TypeText
              as="p"
              className="mt-5 max-w-xl font-mono text-sm leading-relaxed text-[var(--color-muted)] sm:text-base"
              text="Um hub independente para artistas, coletivos e produtoras da música eletrônica nordestina. Descubra line-ups, agende eventos e conecte a cena — do techno de Recife ao dub de Fortaleza."
            />
            <div className="mt-7 flex flex-wrap gap-3">
              <LinkButton to="/artistas" variant="solid">Explorar artistas</LinkButton>
              <LinkButton to="/eventos" variant="outline">Ver eventos</LinkButton>
              <LinkButton to="/cadastro" variant="ghost">Cadastrar-se →</LinkButton>
            </div>
          </div>
          <BootLog
            className="border border-[var(--color-line)] bg-black/40 p-4"
            lines={[
              'inicializando circuito_ne…',
              `artistas conectados: ${artistas.length}`,
              `coletivos/produtoras: ${coletivos.length}`,
              `eventos indexados: ${eventos.length}`,
              'região: nordeste [PE·CE·RN·BA·PB·MA·AL·SE·PI]',
              'status: online ✓',
            ]}
          />
        </div>
      </section>

      {/* PRÓXIMOS EVENTOS */}
      <section>
        <div className="mb-6 flex items-end justify-between">
          <SectionHeading prompt="cat" sub="Os próximos encontros da cena, ordenados por proximidade.">eventos.log</SectionHeading>
          <Link to="/eventos" className="hidden font-mono text-xs uppercase tracking-widest text-[var(--accent-text)] hover:underline sm:block">todos →</Link>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {proximos.map((e) => (
            <Link key={e.id} to={`/eventos/${e.id}`} className="group block border border-[var(--color-line)] transition-colors hover:border-[var(--accent)]">
              <DuotoneImage src={e.capa} alt={`Capa do evento ${e.nome}`} className="aspect-[16/9] w-full" />
              <div className="p-4">
                <div className="mb-2 flex items-center gap-2">
                  <Badge tone="accent">{tipoEventoLabel(e)}</Badge>
                  {e.gratuito && <Badge tone="ok">Gratuito</Badge>}
                </div>
                <h3 className="font-display text-base font-bold leading-tight group-hover:text-[var(--accent-text)]">{e.nome}</h3>
                <p className="mt-1 font-mono text-xs text-[var(--color-muted)]">{fmtData(e.inicio)} · {e.cidade}/{e.estado}</p>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* ARTISTAS EM DESTAQUE */}
      <section>
        <SectionHeading prompt="ls" sub="Produtores, DJs e projetos ao vivo cadastrados no circuito.">artistas/</SectionHeading>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {artistas.map((a) => (
            <AccentScope key={a.id} color={a.corPredominante}>
              <Link to={`/artistas/${a.id}`} className="group block border border-[var(--color-line)] transition-colors hover:border-[var(--accent)]">
                <DuotoneImage src={a.fotoApresentacao} alt={`Foto de ${a.nome}`} className="aspect-[3/4] w-full" />
                <div className="p-3">
                  <h3 className="font-display text-sm font-bold group-hover:text-[var(--accent-text)]">{a.nome}</h3>
                  <p className="mt-1 line-clamp-1 font-mono text-xs text-[var(--color-muted)]">{a.estilos.join(' · ')}</p>
                </div>
              </Link>
            </AccentScope>
          ))}
        </div>
      </section>
    </div>
  )
}
