import { useMemo, useState } from 'react'
import { Link, useNavigate } from '../../router'
import { useStore } from '../../context/StoreContext'
import { useToast } from '../../context/ToastContext'
import { usePageTitle } from '../../lib/usePageTitle'
import { ESTADOS, ESTILOS_MUSICAIS, TIPO_LABEL, type Atuacao, type AtuacaoTipo, type Estado } from '../../data/types'
import { Button, Panel } from '../../components/ui/primitives'
import { Checkbox, Input, RadioCards, Select, Textarea } from '../../components/ui/form'
import { Stepper } from '../../components/ui/Stepper'
import { AccentScope } from '../../components/ui/AccentScope'
import { contrastRatio, maskCPF, maskCache } from '../../lib/utils'

const GENEROS = ['Homem', 'Mulher', 'Não-Binário']

const uid = () => Math.random().toString(36).slice(2, 9)

export function Register({ mode = 'cadastro' }: { mode?: 'cadastro' | 'nova-atuacao' }) {
  usePageTitle(mode === 'cadastro' ? 'Cadastro' : 'Nova atuação')
  const { login, addAtuacao, coletivos, user } = useStore()
  const toast = useToast()
  const navigate = useNavigate()

  const isCadastro = mode === 'cadastro'

  // dados gerais (só cadastro)
  const [geral, setGeral] = useState({ nome: '', email: '', genero: '', nascimento: '', cpf: '', cidade: '', estado: 'PE' as Estado })
  const [social, setSocial] = useState({ instagram: '', bandcamp: '', soundcloud: '', facebook: '', site: '', youtube: '' })
  const [tipo, setTipo] = useState<AtuacaoTipo | ''>('')
  // dados específicos
  const [artista, setArtista] = useState({ nome: '', emailBooking: '', emailContato: '', mesmoEmail: true, presskit: '', mediaCache: '', cnpj: '' })
  const [servico, setServico] = useState({ nome: '', tipoServico: 'estrutura', contato: '', portfolio: '' })
  const [av, setAv] = useState({ nome: '', tipoServico: 'fotografia', contato: '', portfolio: '' })
  const [integrante, setIntegrante] = useState<{ escolha: 'existente' | 'novo' | ''; coletivoId: string }>({ escolha: '', coletivoId: '' })
  const [novoColetivo, setNovoColetivo] = useState({ nome: '', estado: 'PE' as Estado, cidade: '', atuacao: [] as string[], tipo: 'coletivo' as 'coletivo' | 'produtora', bio: '', cnpj: '' })
  // perfil público (artista)
  const [pub, setPub] = useState<{ bio: string; estilos: string[]; cor: string }>({ bio: '', estilos: [], cor: '#ff2040' })

  const [errors, setErrors] = useState<Record<string, string>>({})

  const temPerfilPublico = tipo === 'artista'
  const steps = useMemo(() => {
    if (isCadastro) return ['Dados Gerais', 'Mídias Sociais', 'Dados Específicos', temPerfilPublico ? 'Perfil Público' : 'Concluir']
    return ['Nova Atuação', temPerfilPublico ? 'Perfil Público' : 'Concluir']
  }, [isCadastro, temPerfilPublico])

  const [step, setStep] = useState(0)
  // no modo nova-atuacao, step 0 = tipo+específico, step 1 = público
  const stepReal = isCadastro ? step : step + 2

  const validar = (): boolean => {
    const e: Record<string, string> = {}
    if (stepReal === 0) {
      if (!geral.nome) e.nome = 'Informe seu nome.'
      if (!geral.email) e.email = 'Informe um e-mail válido.'
      if (!geral.nascimento) e.nascimento = 'Informe a data de nascimento.'
      if (!geral.cpf) e.cpf = 'Informe o CPF.'
      if (!geral.cidade) e.cidade = 'Informe a cidade.'
    }
    if (stepReal === 2) {
      if (!tipo) e.tipo = 'Escolha um tipo de cadastro.'
      if (tipo === 'artista' && !artista.nome) e.artistaNome = 'Informe o nome artístico.'
      if (tipo === 'servicos' && !servico.contato) e.servcontato = 'Informe um contato.'
      if (tipo === 'audiovisual' && !av.contato) e.avcontato = 'Informe um contato.'
      if (tipo === 'integrante') {
        if (!integrante.escolha) e.escolha = 'Escolha uma opção.'
        if (integrante.escolha === 'existente' && !integrante.coletivoId) e.coletivoId = 'Selecione o coletivo/produtora.'
        if (integrante.escolha === 'novo') {
          if (!novoColetivo.nome) e.ncNome = 'Informe o nome.'
          if (novoColetivo.tipo === 'produtora' && !novoColetivo.cnpj) e.ncCnpj = 'CNPJ é obrigatório para produtora.'
        }
      }
    }
    if (stepReal === 3 && temPerfilPublico) {
      if (!pub.bio) e.bio = 'Escreva uma bio.'
      if (contrastRatio(pub.cor, '#050506') < 3) e.cor = 'Cor muito escura — será clareada para manter contraste (WCAG).'
    }
    setErrors(e)
    // erro de cor é apenas aviso, não bloqueia
    return Object.keys(e).filter((k) => k !== 'cor').length === 0
  }

  const avancar = () => {
    if (!validar()) {
      toast('Corrija os campos destacados', 'warn')
      return
    }
    if (step < steps.length - 1) {
      setStep((s) => s + 1)
    } else {
      finalizar()
    }
  }

  const buildAtuacao = (): Atuacao => {
    const base = { id: uid() }
    if (tipo === 'artista')
      return {
        ...base,
        tipo: 'artista',
        nome: artista.nome,
        bio: pub.bio,
        fotoApresentacao: 'https://images.unsplash.com/photo-1571266028243-e4733b0f0bb0?w=900&h=1100&fit=crop&auto=format',
        fotos: [],
        estilos: pub.estilos,
        corPredominante: pub.cor,
        emailBooking: artista.mesmoEmail ? artista.emailContato : artista.emailBooking,
        emailContato: artista.emailContato,
        presskit: artista.presskit,
        mediaCache: artista.mediaCache,
        cnpj: artista.cnpj,
        social,
      }
    if (tipo === 'servicos')
      return { ...base, tipo: 'servicos', nome: servico.nome || geral.nome, tipoServico: servico.tipoServico as never, contato: servico.contato, portfolio: servico.portfolio, social }
    if (tipo === 'audiovisual')
      return { ...base, tipo: 'audiovisual', nome: av.nome || geral.nome, tipoServico: av.tipoServico as never, contato: av.contato, portfolio: av.portfolio, social }
    return { ...base, tipo: 'integrante', nome: geral.nome, coletivoIds: integrante.coletivoId ? [integrante.coletivoId] : [], social }
  }

  const finalizar = () => {
    const atuacao = buildAtuacao()
    if (isCadastro) {
      login()
      toast('Conta criada! Bem-vinda ao circuito.', 'ok')
    } else {
      addAtuacao(atuacao)
      toast(`Nova atuação (${TIPO_LABEL[tipo as AtuacaoTipo]}) adicionada`, 'ok')
    }
    if (tipo === 'integrante' && integrante.escolha === 'novo') toast('Solicitação de criação de coletivo registrada', 'info')
    if (tipo === 'integrante' && integrante.escolha === 'existente') toast('Solicitação de acesso enviada ao coletivo', 'info')
    navigate('/painel')
  }

  if (!isCadastro && !user) navigate('/entrar', { replace: true })

  return (
    <div className="mx-auto max-w-2xl py-4">
      <h1 className="mb-1 font-display text-2xl font-bold text-glow">
        <span className="text-[var(--accent-text)]">{isCadastro ? '$ novo_cadastro' : '$ nova_atuacao'}</span>
      </h1>
      <p className="mb-6 font-mono text-sm text-[var(--color-muted)]">
        {isCadastro ? 'Preencha as etapas para entrar no circuito.' : 'Adicione uma nova atuação ao seu perfil existente.'}
      </p>

      <Stepper steps={steps} current={step} />

      <Panel title={`etapa ${step + 1}/${steps.length}`}>
        {/* ETAPA 1 — Dados Gerais (só cadastro) */}
        {isCadastro && step === 0 && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Input label="Nome completo" value={geral.nome} onChange={(e) => setGeral({ ...geral, nome: e.target.value })} required error={errors.nome} />
            <Input label="E-mail" type="email" value={geral.email} onChange={(e) => setGeral({ ...geral, email: e.target.value })} required error={errors.email} />
            <Select label="Gênero" value={geral.genero} onChange={(e) => setGeral({ ...geral, genero: e.target.value })} hint="autoidentificação"
              options={[{ value: '', label: '— selecione —' }, ...GENEROS.map((g) => ({ value: g, label: g }))]} />
            <Input label="Data de nascimento" type="date" value={geral.nascimento} onChange={(e) => setGeral({ ...geral, nascimento: e.target.value })} required error={errors.nascimento} />
            <Input label="CPF" value={geral.cpf} onChange={(e) => setGeral({ ...geral, cpf: e.target.value })} onBlur={(e) => setGeral({ ...geral, cpf: maskCPF(e.target.value) })} required error={errors.cpf} placeholder="000.000.000-00" inputMode="numeric" />
            <Input label="Cidade" value={geral.cidade} onChange={(e) => setGeral({ ...geral, cidade: e.target.value })} required error={errors.cidade} />
            <Select label="Estado" value={geral.estado} onChange={(e) => setGeral({ ...geral, estado: e.target.value as Estado })} options={ESTADOS.map((s) => ({ value: s.value, label: s.label }))} />
            <div className="sm:col-span-2">
              <RadioCards
                legend="Tipo de cadastro (escolha 1 — adicione outras depois)"
                required
                value={tipo}
                onChange={setTipo}
                options={[
                  { value: 'artista', label: 'Artista', desc: 'DJ, produtor, live act' },
                  { value: 'servicos', label: 'Serviços', desc: 'estrutura, som, luzes, performances' },
                  { value: 'audiovisual', label: 'Audiovisual', desc: 'foto, vídeo, som' },
                  { value: 'integrante', label: 'Integrante de Coletivo', desc: 'coletivo ou produtora' },
                ]}
              />
              {errors.tipo && <p className="mt-1 font-mono text-xs text-[var(--accent-text)]">[erro] {errors.tipo}</p>}
            </div>
          </div>
        )}

        {/* ETAPA 2 — Mídias Sociais (só cadastro) */}
        {isCadastro && step === 1 && (
          <div className="grid gap-4 sm:grid-cols-2">
            {(['instagram', 'soundcloud', 'bandcamp', 'facebook', 'youtube', 'site'] as const).map((k) => (
              <Input key={k} label={k} value={social[k]} onChange={(e) => setSocial({ ...social, [k]: e.target.value })} placeholder={k === 'site' ? 'https://' : '@usuario'} />
            ))}
          </div>
        )}

        {/* ETAPA 3 — Dados específicos (cadastro step 2, nova-atuacao step 0) */}
        {stepReal === 2 && (
          <div className="space-y-4">
            {!isCadastro && (
              <>
                <RadioCards
                  legend="Escolha o tipo da nova atuação"
                  required
                  value={tipo}
                  onChange={setTipo}
                  options={[
                    { value: 'artista', label: 'Artista' },
                    { value: 'servicos', label: 'Serviços' },
                    { value: 'audiovisual', label: 'Audiovisual' },
                    { value: 'integrante', label: 'Integrante de Coletivo' },
                  ]}
                />
                {errors.tipo && <p className="font-mono text-xs text-[var(--accent-text)]">[erro] {errors.tipo}</p>}
              </>
            )}

            {tipo === 'artista' && (
              <div className="grid gap-4 sm:grid-cols-2">
                <Input label="Nome artístico / projeto" value={artista.nome} onChange={(e) => setArtista({ ...artista, nome: e.target.value })} required error={errors.artistaNome} hint="cada projeto pode ter um perfil próprio" />
                <Input label="E-mail de contato" type="email" value={artista.emailContato} onChange={(e) => setArtista({ ...artista, emailContato: e.target.value })} />
                <div className="sm:col-span-2 space-y-2">
                  <Checkbox label="Usar mesmo e-mail de contato para booking" checked={artista.mesmoEmail} onChange={(e) => setArtista({ ...artista, mesmoEmail: e.target.checked })} />
                  {!artista.mesmoEmail && (
                    <Input label="E-mail para booking" type="email" value={artista.emailBooking} onChange={(e) => setArtista({ ...artista, emailBooking: e.target.value })} />
                  )}
                </div>
                <Input label="Presskit (URL)" value={artista.presskit} onChange={(e) => setArtista({ ...artista, presskit: e.target.value })} placeholder="https://" />
                <Input label="Média de cachê" value={artista.mediaCache} onChange={(e) => setArtista({ ...artista, mediaCache: e.target.value })} onBlur={(e) => setArtista({ ...artista, mediaCache: maskCache(e.target.value) })} placeholder="R$ 0,00" inputMode="decimal" hint="por apresentação" />
                <Input label="CNPJ (facultativo)" value={artista.cnpj} onChange={(e) => setArtista({ ...artista, cnpj: e.target.value })} />
              </div>
            )}

            {tipo === 'servicos' && (
              <div className="grid gap-4 sm:grid-cols-2">
                <Select label="Tipo de serviço" value={servico.tipoServico} onChange={(e) => setServico({ ...servico, tipoServico: e.target.value })} options={[
                  { value: 'estrutura', label: 'Estrutura' }, { value: 'som', label: 'Som' }, { value: 'luzes', label: 'Luzes' }, { value: 'performances', label: 'Performances' }, { value: 'outros', label: 'Outros' },
                ]} />
                <Input label="Nome / empresa" value={servico.nome} onChange={(e) => setServico({ ...servico, nome: e.target.value })} />
                <Input label="Contato" value={servico.contato} onChange={(e) => setServico({ ...servico, contato: e.target.value })} required error={errors.servcontato} />
                <Input label="Portfólio (URL)" value={servico.portfolio} onChange={(e) => setServico({ ...servico, portfolio: e.target.value })} placeholder="https://" />
              </div>
            )}

            {tipo === 'audiovisual' && (
              <div className="grid gap-4 sm:grid-cols-2">
                <Select label="Tipo de serviço" value={av.tipoServico} onChange={(e) => setAv({ ...av, tipoServico: e.target.value })} options={[
                  { value: 'fotografia', label: 'Fotografia' }, { value: 'video', label: 'Vídeo' }, { value: 'audiovisual-completo', label: 'Audiovisual completo' }, { value: 'som', label: 'Som' },
                ]} />
                <Input label="Nome / estúdio" value={av.nome} onChange={(e) => setAv({ ...av, nome: e.target.value })} />
                <Input label="Contato" value={av.contato} onChange={(e) => setAv({ ...av, contato: e.target.value })} required error={errors.avcontato} />
                <Input label="Portfólio (URL)" value={av.portfolio} onChange={(e) => setAv({ ...av, portfolio: e.target.value })} placeholder="https://" />
              </div>
            )}

            {tipo === 'integrante' && (
              <div className="space-y-4">
                <RadioCards
                  legend="Como deseja participar?"
                  required
                  value={integrante.escolha}
                  onChange={(v) => setIntegrante({ ...integrante, escolha: v })}
                  options={[
                    { value: 'existente', label: 'Selecionar existente', desc: 'envia solicitação de acesso' },
                    { value: 'novo', label: 'Criar coletivo/produtora', desc: 'você será administrador' },
                  ]}
                />
                {errors.escolha && <p className="font-mono text-xs text-[var(--accent-text)]">[erro] {errors.escolha}</p>}

                {integrante.escolha === 'existente' && (
                  <Select label="Coletivo/Produtora" value={integrante.coletivoId} onChange={(e) => setIntegrante({ ...integrante, coletivoId: e.target.value })} required error={errors.coletivoId}
                    options={[{ value: '', label: '— selecione —' }, ...coletivos.map((c) => ({ value: c.id, label: `${c.nome} (${c.tipo})` }))]} />
                )}

                {integrante.escolha === 'novo' && (
                  <div className="grid gap-4 border border-[var(--color-line)] p-4 sm:grid-cols-2">
                    <Input label="Nome" value={novoColetivo.nome} onChange={(e) => setNovoColetivo({ ...novoColetivo, nome: e.target.value })} required error={errors.ncNome} />
                    <Select label="Tipo" value={novoColetivo.tipo} onChange={(e) => setNovoColetivo({ ...novoColetivo, tipo: e.target.value as never })} options={[{ value: 'coletivo', label: 'Coletivo' }, { value: 'produtora', label: 'Produtora' }]} />
                    <Input label="Cidade" value={novoColetivo.cidade} onChange={(e) => setNovoColetivo({ ...novoColetivo, cidade: e.target.value })} />
                    <Select label="Estado" value={novoColetivo.estado} onChange={(e) => setNovoColetivo({ ...novoColetivo, estado: e.target.value as Estado })} options={ESTADOS.map((s) => ({ value: s.value, label: s.label }))} />
                    <div className="sm:col-span-2">
                      <p className="mb-1 font-mono text-xs uppercase tracking-widest text-[var(--color-muted)]"><span className="text-[var(--accent-text)]">$ </span>atuação</p>
                      <div className="flex flex-wrap gap-3">
                        {['Eventos Musicais', 'Eventos Culturais', 'Serviços', 'Artistas'].map((a) => (
                          <Checkbox key={a} label={a} checked={novoColetivo.atuacao.includes(a)} onChange={(e) => setNovoColetivo({ ...novoColetivo, atuacao: e.target.checked ? [...novoColetivo.atuacao, a] : novoColetivo.atuacao.filter((x) => x !== a) })} />
                        ))}
                      </div>
                    </div>
                    <div className="sm:col-span-2">
                      <Textarea label="Bio" value={novoColetivo.bio} onChange={(e) => setNovoColetivo({ ...novoColetivo, bio: e.target.value })} />
                    </div>
                    <div className="sm:col-span-2">
                      <Input label="CNPJ" value={novoColetivo.cnpj} onChange={(e) => setNovoColetivo({ ...novoColetivo, cnpj: e.target.value })} required={novoColetivo.tipo === 'produtora'} error={errors.ncCnpj}
                        hint={novoColetivo.tipo === 'produtora' ? 'obrigatório para produtora' : 'opcional para coletivo'} />
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ETAPA 4 — Perfil público (só artista) */}
        {stepReal === 3 && (
          temPerfilPublico ? (
            <div className="space-y-4">
              <p className="font-mono text-xs text-[var(--color-muted)]">Estes dados aparecem no seu perfil público de artista.</p>
              <Textarea label="Bio pública" value={pub.bio} onChange={(e) => setPub({ ...pub, bio: e.target.value })} required error={errors.bio} />
              <div>
                <Select
                  label="Estilos musicais"
                  value=""
                  hint="selecione um ou mais estilos"
                  onChange={(e) => {
                    const v = e.target.value
                    if (v && !pub.estilos.includes(v)) setPub({ ...pub, estilos: [...pub.estilos, v] })
                  }}
                  options={[{ value: '', label: '— adicionar estilo —' }, ...ESTILOS_MUSICAIS.filter((s) => !pub.estilos.includes(s)).map((s) => ({ value: s, label: s }))]}
                />
                {pub.estilos.length > 0 && (
                  <ul className="mt-2 flex flex-wrap gap-2">
                    {pub.estilos.map((s) => (
                      <li key={s}>
                        <button type="button" onClick={() => setPub({ ...pub, estilos: pub.estilos.filter((x) => x !== s) })} className="inline-flex items-center gap-1.5 border border-[var(--accent)] px-2 py-0.5 font-mono text-[0.65rem] uppercase tracking-widest text-[var(--accent-text)] hover:bg-[color:color-mix(in_srgb,var(--accent)_15%,transparent)]">
                          {s} <span aria-hidden>✕</span><span className="sr-only">remover {s}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div>
                <label htmlFor="cor" className="mb-1 block font-mono text-xs uppercase tracking-widest text-[var(--color-muted)]"><span className="text-[var(--accent-text)]">$ </span>cor predominante</label>
                <div className="flex items-center gap-3">
                  <input id="cor" type="color" value={pub.cor} onChange={(e) => setPub({ ...pub, cor: e.target.value })} className="h-10 w-16 cursor-pointer border border-[var(--color-line)] bg-transparent" />
                  <AccentScope color={pub.cor}>
                    <span className="neon-border px-3 py-1.5 font-mono text-sm text-[var(--accent-text)]">prévia do accent</span>
                  </AccentScope>
                </div>
                {errors.cor && <p className="mt-1 font-mono text-xs text-[var(--color-warn)]">[aviso] {errors.cor}</p>}
              </div>
            </div>
          ) : (
            <div className="py-6 text-center font-mono text-sm text-[var(--color-muted)]">
              <p>Este tipo de cadastro não possui perfil público.</p>
              <p className="mt-2 text-[var(--accent-text)]">Tudo pronto — clique em concluir.</p>
            </div>
          )
        )}

        <div className="mt-6 flex items-center justify-between border-t border-[var(--color-line)] pt-4">
          <Button variant="ghost" onClick={() => (step === 0 ? navigate(isCadastro ? '/entrar' : '/painel/dados') : setStep((s) => s - 1))}>
            ← voltar
          </Button>
          <Button variant="solid" onClick={avancar}>
            {step < steps.length - 1 ? 'avançar →' : 'concluir ✓'}
          </Button>
        </div>
      </Panel>

      {isCadastro && (
        <p className="mt-4 text-center font-mono text-xs text-[var(--color-muted)]">
          Já tem conta? <Link to="/entrar" className="text-[var(--accent-text)] hover:underline">entrar</Link>
        </p>
      )}
    </div>
  )
}
