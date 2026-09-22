import { Link } from '../../router'
import { useStore } from '../../context/StoreContext'
import { usePageTitle } from '../../lib/usePageTitle'
import { Badge, Empty, Panel, SectionHeading } from '../../components/ui/primitives'
import { AccentScope } from '../../components/ui/AccentScope'

type Kind = 'artistas' | 'servicos' | 'audiovisual' | 'coletivos'

const TITLES: Record<Kind, { title: string; sub: string }> = {
  artistas: { title: 'explorar/artistas', sub: 'Base completa de artistas com dados de booking — cachê médio, presskit e contatos reservados a administradores.' },
  servicos: { title: 'explorar/serviços', sub: 'Estrutura, som, luzes e performances disponíveis no circuito, com contato direto.' },
  audiovisual: { title: 'explorar/audiovisual', sub: 'Fotografia, vídeo e cobertura completa da cena, com portfólio e contato.' },
  coletivos: { title: 'explorar/coletivos', sub: 'Coletivos e produtoras da rede, incluindo dados administrativos como CNPJ.' },
}

function Info({ label, value }: { label: string; value?: string }) {
  if (!value) return null
  return (
    <div>
      <dt className="text-[0.65rem] uppercase tracking-widest text-[var(--color-muted)]">{label}</dt>
      <dd className="break-words">{value}</dd>
    </div>
  )
}

export function Explore({ kind }: { kind: Kind }) {
  const { user, artistas, servicos, audiovisuais, coletivos } = useStore()
  usePageTitle(TITLES[kind].title)

  const isAdmin =
    !!user &&
    coletivos.some((c) =>
      c.membros.some((m) => m.userId === user.id && (c.cargos.find((cg) => cg.id === m.cargoId)?.nivel ?? 0) >= 2),
    )

  const { title, sub } = TITLES[kind]

  if (!isAdmin)
    return (
      <div>
        <SectionHeading prompt="!" sub="Requer nível de administrador (nível 2) em algum coletivo/produtora.">
          {title}
        </SectionHeading>
        <Empty>
          Acesso restrito.{' '}
          <Link to="/painel" className="text-[var(--accent-text)] underline">voltar ao painel</Link>
        </Empty>
      </div>
    )

  return (
    <div>
      <SectionHeading prompt="grep" sub={sub}>{title}</SectionHeading>

      {kind === 'artistas' && (
        <ul className="grid gap-4 md:grid-cols-2">
          {artistas.map((a) => (
            <li key={a.id}>
              <AccentScope color={a.corPredominante}>
                <Panel title={a.nome}>
                  <div className="mb-3 flex flex-wrap gap-1.5">
                    {a.estilos.map((s) => <Badge key={s} tone="accent">{s}</Badge>)}
                  </div>
                  <dl className="space-y-3 font-mono text-sm">
                    <Info label="e-mail booking" value={a.emailBooking} />
                    <Info label="e-mail contato" value={a.emailContato} />
                    <Info label="média de cachê" value={a.mediaCache} />
                    <Info label="cnpj" value={a.cnpj} />
                    {a.presskit && (
                      <div>
                        <dt className="text-[0.65rem] uppercase tracking-widest text-[var(--color-muted)]">presskit</dt>
                        <dd><a href={a.presskit} target="_blank" rel="noopener noreferrer" className="text-[var(--accent-text)] underline">abrir presskit ↗</a></dd>
                      </div>
                    )}
                  </dl>
                  <Link to={`/artistas/${a.id}`} className="mt-4 inline-block font-mono text-xs text-[var(--accent-text)] underline">ver perfil público →</Link>
                </Panel>
              </AccentScope>
            </li>
          ))}
        </ul>
      )}

      {kind === 'servicos' && (
        <ul className="grid gap-4 md:grid-cols-2">
          {servicos.map((s) => (
            <li key={s.id}>
              <Panel title={s.nome}>
                <div className="mb-3"><Badge tone="accent">{s.tipoServico}</Badge></div>
                <dl className="space-y-3 font-mono text-sm">
                  <Info label="contato" value={s.contato} />
                  {s.portfolio && (
                    <div>
                      <dt className="text-[0.65rem] uppercase tracking-widest text-[var(--color-muted)]">portfólio</dt>
                      <dd><a href={s.portfolio} target="_blank" rel="noopener noreferrer" className="text-[var(--accent-text)] underline break-all">{s.portfolio} ↗</a></dd>
                    </div>
                  )}
                  <Info label="instagram" value={s.social.instagram} />
                </dl>
              </Panel>
            </li>
          ))}
        </ul>
      )}

      {kind === 'audiovisual' && (
        <ul className="grid gap-4 md:grid-cols-2">
          {audiovisuais.map((s) => (
            <li key={s.id}>
              <Panel title={s.nome}>
                <div className="mb-3"><Badge tone="accent">{s.tipoServico}</Badge></div>
                <dl className="space-y-3 font-mono text-sm">
                  <Info label="contato" value={s.contato} />
                  {s.portfolio && (
                    <div>
                      <dt className="text-[0.65rem] uppercase tracking-widest text-[var(--color-muted)]">portfólio</dt>
                      <dd><a href={s.portfolio} target="_blank" rel="noopener noreferrer" className="text-[var(--accent-text)] underline break-all">{s.portfolio} ↗</a></dd>
                    </div>
                  )}
                  <Info label="instagram" value={s.social.instagram} />
                  <Info label="youtube" value={s.social.youtube} />
                </dl>
              </Panel>
            </li>
          ))}
        </ul>
      )}

      {kind === 'coletivos' && (
        <ul className="grid gap-4 md:grid-cols-2">
          {coletivos.map((c) => (
            <li key={c.id}>
              <AccentScope color={c.corPredominante}>
                <Panel title={c.nome}>
                  <div className="mb-3 flex flex-wrap gap-1.5">
                    <Badge tone="accent">{c.tipo === 'produtora' ? 'Produtora' : 'Coletivo'}</Badge>
                    <Badge>{c.cidade}/{c.estado}</Badge>
                  </div>
                  <dl className="space-y-3 font-mono text-sm">
                    <Info label="cnpj" value={c.cnpj ?? '—'} />
                    <Info label="membros" value={`${c.membros.length}`} />
                    <Info label="solicitações pendentes" value={`${c.solicitacoes?.length ?? 0}`} />
                    <Info label="e-mail / site" value={c.social.site} />
                    <Info label="instagram" value={c.social.instagram} />
                  </dl>
                  <Link to={`/coletivos/${c.id}`} className="mt-4 inline-block font-mono text-xs text-[var(--accent-text)] underline">ver perfil público →</Link>
                </Panel>
              </AccentScope>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
