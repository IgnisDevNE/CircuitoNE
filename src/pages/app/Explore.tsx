import { useMemo, useState, type ReactNode } from 'react'
import { Link, NavLink } from '../../router'
import { ESTADOS } from '../../data/types'
import { estiloLabels } from '../../lib/artist'
import type { ColetivoPublico } from '../../server/mappers/collectives'
import type { DadosRestritos, ExploreColetivosData, ExploreData, ExplorePerfisData, ExploreKind, PerfilExplorar } from '../../server/mappers/explore'
import { Badge, Empty, LinkButton, Panel, SectionHeading } from '../../components/ui/primitives'
import { Input, Select } from '../../components/ui/form'
import { AccentScope } from '../../components/ui/AccentScope'

const PAGES: Record<ExploreKind, { title: string; sub: string; label: string }> = {
  artistas: { title: 'explorar/artistas', label: 'Artistas', sub: 'Artistas ativos no circuito. Contatos de booking, cachê e presskit aparecem só para quem pode vê-los.' },
  servicos: { title: 'explorar/serviços', label: 'Serviços', sub: 'Estrutura, som, luzes e performances disponíveis no circuito.' },
  audiovisual: { title: 'explorar/audiovisual', label: 'Audiovisual', sub: 'Fotografia, vídeo e cobertura completa da cena.' },
  coletivos: { title: 'explorar/coletivos', label: 'Coletivos', sub: 'Coletivos e produtoras aprovados pela administração do site.' },
}

/** Aviso mostrado a quem não é proprietário elegível: o banco não devolve os dados restritos, então nada é escondido por CSS. */
export const RESTRICTED_NOTICE = 'Disponível para proprietários de coletivos aprovados com verificação em duas etapas'

const normalize = (value: string) => value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
const includes = (haystack: string, needle: string) => normalize(haystack).includes(normalize(needle))
const UF_OPTIONS = [{ value: '', label: 'todos os estados' }, ...ESTADOS.map((estado) => ({ value: estado.value, label: estado.value }))]

function Info({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-[0.65rem] uppercase tracking-widest text-[var(--color-muted)]">{label}</dt>
      <dd className="break-words">{children}</dd>
    </div>
  )
}

const external = 'text-[var(--accent-text)] underline break-all'

function Restricted({ dados }: { dados: DadosRestritos }) {
  const empty = Object.keys(dados).length === 0
  return (
    <dl aria-label="Dados restritos" className="mt-3 space-y-2 border-t border-[var(--color-line)] pt-3 font-mono text-sm">
      {dados.tipo && <Info label="tipo">{dados.tipo}</Info>}
      {dados.emailBooking && <Info label="e-mail booking">{dados.emailBooking}</Info>}
      {dados.emailContato && <Info label="e-mail contato">{dados.emailContato}</Info>}
      {dados.telefone && <Info label="telefone">{dados.telefone}</Info>}
      {dados.cache && <Info label="média de cachê">{dados.cache}</Info>}
      {dados.cnpj && <Info label="cnpj">{dados.cnpj}</Info>}
      {dados.presskit && (
        <Info label="presskit">
          <a href={dados.presskit} target="_blank" rel="noopener noreferrer" className={external}>abrir presskit ↗</a>
        </Info>
      )}
      {dados.portfolio && (
        <Info label="portfólio">
          <a href={dados.portfolio} target="_blank" rel="noopener noreferrer" className={external}>{dados.portfolio} ↗</a>
        </Info>
      )}
      {empty && <p className="text-xs text-[var(--color-muted)]">Sem dados profissionais cadastrados.</p>}
    </dl>
  )
}

function ProfileCard({ perfil, kind }: { perfil: PerfilExplorar; kind: ExplorePerfisData['kind'] }) {
  // Estilos só existem para artistas públicos (ou os do próprio titular): sem eles não há página pública para abrir.
  const publico = kind === 'artistas' && !perfil.minha && perfil.estilos.length > 0
  return (
    <Panel title={perfil.nome}>
      <div className="mb-3 flex flex-wrap gap-1.5">
        <Badge>{perfil.cidade}/{perfil.estado}</Badge>
        {perfil.minha && <Badge tone="ok">sua atuação</Badge>}
        {estiloLabels(perfil.estilos).map((estilo) => <Badge key={estilo} tone="accent">{estilo}</Badge>)}
      </div>
      {perfil.descricao && <p className="line-clamp-3 text-sm text-[var(--color-muted)]">{perfil.descricao}</p>}
      {perfil.restrito && <Restricted dados={perfil.restrito} />}
      <div className="mt-4 flex flex-wrap items-center gap-3">
        {publico && <Link to={`/artistas/${perfil.id}`} className="font-mono text-xs text-[var(--accent-text)] underline">ver perfil público →</Link>}
        {!perfil.minha && <LinkButton to={`/painel/mensagens/nova?para=profile:${perfil.id}`} variant="outline" size="sm">Enviar mensagem</LinkButton>}
      </div>
    </Panel>
  )
}

function Profiles({ data }: { data: ExplorePerfisData }) {
  const [q, setQ] = useState('')
  const [uf, setUf] = useState('')
  const [estilo, setEstilo] = useState('')
  const [tipo, setTipo] = useState('')

  const estilos = useMemo(
    () => [...new Set(data.perfis.flatMap((perfil) => perfil.estilos.map((item) => item.estilo)))].sort((a, b) => a.localeCompare(b, 'pt-BR')),
    [data.perfis],
  )
  // O tipo de serviço é dado restrito: só há o que filtrar quando o banco o devolveu.
  const tipos = useMemo(() => {
    const found = new Map<string, string>()
    for (const perfil of data.perfis) if (perfil.restrito?.tipoValor && perfil.restrito.tipo) found.set(perfil.restrito.tipoValor, perfil.restrito.tipo)
    return [...found].map(([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label, 'pt-BR'))
  }, [data.perfis])

  const filtrados = data.perfis.filter(
    (perfil) =>
      (!q || includes(perfil.nome, q) || includes(perfil.cidade, q)) &&
      (!uf || perfil.estado === uf) &&
      (!estilo || perfil.estilos.some((item) => item.estilo === estilo)) &&
      (!tipo || perfil.restrito?.tipoValor === tipo),
  )

  return (
    <>
      {data.restritoIndisponivel && (
        <p role="note" className="mb-6 border border-[var(--color-line)] p-3 font-mono text-xs text-[var(--color-muted)]">
          Contatos, cachê, presskit, portfólio e tipo de serviço: {RESTRICTED_NOTICE}.{' '}
          <Link to="/painel/seguranca" className="text-[var(--accent-text)] underline">verificação em duas etapas (Segurança)</Link>
        </p>
      )}
      <form role="search" aria-label="Filtrar atuações" onSubmit={(event) => event.preventDefault()} className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Input label="Buscar" type="search" placeholder="nome ou cidade…" value={q} onChange={(event) => setQ(event.target.value)} />
        <Select label="Estado" value={uf} onChange={(event) => setUf(event.target.value)} options={UF_OPTIONS} />
        {data.kind === 'artistas' && (
          <Select label="Estilo" value={estilo} onChange={(event) => setEstilo(event.target.value)} options={[{ value: '', label: 'todos os estilos' }, ...estilos.map((item) => ({ value: item, label: item }))]} />
        )}
        {data.kind !== 'artistas' && tipos.length > 0 && (
          <Select label="Tipo" value={tipo} onChange={(event) => setTipo(event.target.value)} options={[{ value: '', label: 'todos os tipos' }, ...tipos]} />
        )}
      </form>
      <p role="status" className="mb-4 font-mono text-xs text-[var(--color-muted)]">{filtrados.length} de {data.perfis.length}</p>
      {filtrados.length === 0 ? (
        <Empty>{data.perfis.length === 0 ? 'Nenhuma atuação cadastrada ainda.' : 'Nenhuma atuação encontrada para os filtros atuais.'}</Empty>
      ) : (
        <ul className="grid gap-4 md:grid-cols-2">
          {filtrados.map((perfil) => (
            <li key={perfil.id}><ProfileCard perfil={perfil} kind={data.kind} /></li>
          ))}
        </ul>
      )}
    </>
  )
}

function CollectiveCard({ coletivo }: { coletivo: ColetivoPublico }) {
  return (
    <AccentScope color={coletivo.corPredominante}>
      <Panel title={coletivo.nome}>
        <div className="mb-3 flex flex-wrap gap-1.5">
          <Badge tone="accent">{coletivo.tipo === 'produtora' ? 'Produtora' : 'Coletivo'}</Badge>
          <Badge>{coletivo.cidade}/{coletivo.estado}</Badge>
          {coletivo.atuacao.map((item) => <Badge key={item}>{item}</Badge>)}
        </div>
        {coletivo.bio && <p className="line-clamp-3 text-sm text-[var(--color-muted)]">{coletivo.bio}</p>}
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Link to={`/coletivos/${coletivo.id}`} className="font-mono text-xs text-[var(--accent-text)] underline">ver perfil público →</Link>
          <LinkButton to={`/painel/mensagens/nova?para=collective:${coletivo.id}`} variant="outline" size="sm">Enviar mensagem</LinkButton>
        </div>
      </Panel>
    </AccentScope>
  )
}

function Collectives({ data }: { data: ExploreColetivosData }) {
  const [q, setQ] = useState('')
  const [uf, setUf] = useState('')
  const [tipo, setTipo] = useState('')
  const filtrados = data.coletivos.filter(
    (coletivo) => (!q || includes(coletivo.nome, q) || includes(coletivo.cidade, q)) && (!uf || coletivo.estado === uf) && (!tipo || coletivo.tipo === tipo),
  )
  return (
    <>
      <form role="search" aria-label="Filtrar coletivos" onSubmit={(event) => event.preventDefault()} className="mb-6 grid gap-4 sm:grid-cols-3">
        <Input label="Buscar" type="search" placeholder="nome ou cidade…" value={q} onChange={(event) => setQ(event.target.value)} />
        <Select label="Estado" value={uf} onChange={(event) => setUf(event.target.value)} options={UF_OPTIONS} />
        <Select label="Tipo" value={tipo} onChange={(event) => setTipo(event.target.value)} options={[{ value: '', label: 'todos os tipos' }, { value: 'coletivo', label: 'Coletivo' }, { value: 'produtora', label: 'Produtora' }]} />
      </form>
      <p role="status" className="mb-4 font-mono text-xs text-[var(--color-muted)]">{filtrados.length} de {data.coletivos.length}</p>
      {filtrados.length === 0 ? (
        <Empty>{data.coletivos.length === 0 ? 'Nenhum coletivo aprovado ainda.' : 'Nenhum coletivo encontrado para os filtros atuais.'}</Empty>
      ) : (
        <ul className="grid gap-4 md:grid-cols-2">
          {filtrados.map((coletivo) => (
            <li key={coletivo.id}><CollectiveCard coletivo={coletivo} /></li>
          ))}
        </ul>
      )}
    </>
  )
}

/** `/painel/explorar/:kind`: catálogo interno para contas autenticadas; os dados restritos só aparecem quando o banco os devolve. */
export function Explore({ data }: { data: ExploreData }) {
  const page = PAGES[data.kind]
  return (
    <div>
      <SectionHeading prompt="grep" sub={page.sub}>{page.title}</SectionHeading>
      <nav aria-label="Catálogo" className="mb-6 flex flex-wrap gap-1 border-b border-[var(--color-line)]">
        {(Object.keys(PAGES) as ExploreKind[]).map((kind) => (
          <NavLink
            key={kind}
            to={`/painel/explorar/${kind}`}
            className="-mb-px border-b-2 border-transparent px-3 py-2 font-mono text-xs uppercase tracking-widest text-[var(--color-muted)] hover:text-[var(--foreground)]"
            activeClassName="!border-[var(--accent)] !text-[var(--foreground)]"
          >
            {PAGES[kind].label}
          </NavLink>
        ))}
      </nav>
      {data.kind === 'coletivos' ? <Collectives data={data} /> : <Profiles data={data} />}
    </div>
  )
}
