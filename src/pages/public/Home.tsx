import { Link } from 'react-router'
import { fmtData, tipoEventoLabel } from '../../lib/utils'
import { estiloLabels } from '../../lib/artist'
import { BootLog, Cursor, GlitchText, ScanBeam, TypeText } from '../../components/ui/anim'
import { Badge, Empty, LinkButton, SectionHeading } from '../../components/ui/primitives'
import { DuotoneImage } from '../../components/ui/DuotoneImage'
import type { HomeData } from '../../server/mappers/home'

export function Home({ proximos, artistas, coletivos, totais }: HomeData) {
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
          {/* O registro animado é decorativo (oculto do leitor de tela); os totais ficam aqui em texto. */}
          <p className="sr-only">
            {totais.artistas} artistas, {totais.coletivos} coletivos e produtoras, {totais.eventos} eventos programados, na região Nordeste.
          </p>
          <BootLog
            className="border border-[var(--color-line)] bg-black/40 p-4"
            lines={[
              'inicializando circuito_ne…',
              `artistas conectados: ${totais.artistas}`,
              `coletivos/produtoras: ${totais.coletivos}`,
              `eventos programados: ${totais.eventos}`,
              'região: nordeste [PE·CE·RN·BA·PB·MA·AL·SE·PI]',
              'status: online ✓',
            ]}
          />
        </div>
      </section>

      {/* ARTISTAS EM DESTAQUE */}
      <section>
        <SectionHeading as="h2" prompt="ls" sub="Produtores, DJs e projetos ao vivo cadastrados no circuito.">artistas/</SectionHeading>
        {artistas.length === 0 ? (
          <Empty>Nenhum artista publicado ainda.</Empty>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {artistas.map((a) => (
              <Link key={a.id} to={`/artistas/${a.id}`} className="group block border border-[var(--color-line)] transition-colors hover:border-[var(--accent)]">
                <DuotoneImage src={a.foto} alt={`Foto de ${a.nome}`} className="aspect-[3/4] w-full" />
                <div className="p-3">
                  <h3 className="font-display text-sm font-bold group-hover:text-[var(--accent-text)]">{a.nome}</h3>
                  <p data-teaser className="mt-1 line-clamp-1 font-mono text-xs text-[var(--color-muted)]">{estiloLabels(a.estilos).join(' · ')}</p>
                  <p className="mt-1 font-mono text-xs text-[var(--color-muted)]">{a.cidade}/{a.estado}</p>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* COLETIVOS E PRODUTORAS */}
      {coletivos.length > 0 && (
        <section>
          <div className="mb-6 flex items-end justify-between">
            <SectionHeading as="h2" prompt="ls" sub="Coletivos e produtoras aprovados no circuito.">coletivos/</SectionHeading>
            <Link to="/coletivos" className="hidden font-mono text-xs uppercase tracking-widest text-[var(--accent-text)] hover:underline sm:block">todos →</Link>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {coletivos.map((c) => (
              <Link key={c.id} to={`/coletivos/${c.id}`} className="group block border border-[var(--color-line)] p-4 transition-colors hover:border-[var(--accent)]">
                <Badge tone="neutral">{c.tipo === 'produtora' ? 'Produtora' : 'Coletivo'}</Badge>
                <h3 className="mt-2 font-display text-sm font-bold group-hover:text-[var(--accent-text)]">{c.nome}</h3>
                <p className="mt-1 font-mono text-xs text-[var(--color-muted)]">{c.cidade}/{c.estado}</p>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* PRÓXIMOS EVENTOS */}
      <section>
        <div className="mb-6 flex items-end justify-between">
          <SectionHeading as="h2" prompt="cat" sub="Os próximos encontros da cena, ordenados por proximidade.">eventos.log</SectionHeading>
          <Link to="/eventos" className="hidden font-mono text-xs uppercase tracking-widest text-[var(--accent-text)] hover:underline sm:block">todos →</Link>
        </div>
        {proximos.length === 0 ? (
          <Empty>Nenhum evento programado no momento.</Empty>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {proximos.map((e) => (
              <Link key={e.id} to={`/eventos/${e.id}`} className="group block border border-[var(--color-line)] transition-colors hover:border-[var(--accent)]">
                <DuotoneImage src={e.capa} alt={`Capa do evento ${e.nome}`} className="aspect-[16/9] w-full" />
                <div className="p-4">
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <Badge tone="accent">{tipoEventoLabel(e)}</Badge>
                    {e.estilo && <Badge tone="neutral">{e.estilo}</Badge>}
                    {e.gratuito && <Badge tone="ok">Gratuito</Badge>}
                  </div>
                  <h3 className="font-display text-base font-bold leading-tight group-hover:text-[var(--accent-text)]">{e.nome}</h3>
                  <p className="mt-1 font-mono text-xs text-[var(--color-muted)]">{fmtData(e.inicio)} · {e.cidade}/{e.estado}</p>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
