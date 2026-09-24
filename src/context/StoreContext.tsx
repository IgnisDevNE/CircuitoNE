import { createContext, useContext, useMemo, useState, type ReactNode } from 'react'
import { artistas as seedArtistas, audiovisuais as seedAudiovisuais, coletivos as seedColetivos, demoUser, eventos as seedEventos, servicos as seedServicos, threads as seedThreads } from '../data/mock'
import type { ArtistProfile, AVProfile, Collective, Evento, ServiceProfile, Thread, User } from '../data/types'

interface Store {
  now: number
  // sessão
  user: User | null
  login: () => void
  logout: () => void
  // dados
  artistas: ArtistProfile[]
  servicos: ServiceProfile[]
  audiovisuais: AVProfile[]
  coletivos: Collective[]
  eventos: Evento[]
  threads: Thread[]
  // ações stub
  addEvento: (e: Evento) => void
  sendMessage: (threadId: string, texto: string) => void
  markThreadRead: (threadId: string) => void
  updateColetivo: (id: string, patch: Partial<Collective>) => void
  updateUser: (patch: Partial<User>) => void
  addAtuacao: (a: User['atuacoes'][number]) => void
  aprovarSolicitacao: (colId: string, solId: string) => void
  recusarSolicitacao: (colId: string, solId: string) => void
}

const Ctx = createContext<Store | null>(null)

let evCounter = 100

export function StoreProvider({ children, initialNow = Date.now() }: { children: ReactNode; initialNow?: number }) {
  const [now] = useState(initialNow)
  const [user, setUser] = useState<User | null>(null)
  const [artistas] = useState<ArtistProfile[]>(seedArtistas)
  const [servicos] = useState<ServiceProfile[]>(seedServicos)
  const [audiovisuais] = useState<AVProfile[]>(seedAudiovisuais)
  const [coletivos, setColetivos] = useState<Collective[]>(seedColetivos)
  const [eventos, setEventos] = useState<Evento[]>(seedEventos)
  const [threads, setThreads] = useState<Thread[]>(seedThreads)

  const value = useMemo<Store>(
    () => ({
      now,
      user,
      login: () => setUser(demoUser),
      logout: () => setUser(null),
      artistas,
      servicos,
      audiovisuais,
      coletivos,
      eventos,
      threads,
      addEvento: (e) => setEventos((s) => [{ ...e, id: `ev-${evCounter++}` }, ...s]),
      sendMessage: (threadId, texto) =>
        setThreads((s) =>
          s.map((t) =>
            t.id === threadId
              ? {
                  ...t,
                  mensagens: [
                    ...t.mensagens,
                    { id: `m-${Date.now()}`, autorId: 'u-demo', autorNome: 'Você', texto, timestamp: new Date().toISOString() },
                  ],
                }
              : t,
          ),
        ),
      markThreadRead: (threadId) =>
        setThreads((s) =>
          // Evita novo array (e re-render em loop) quando já está lida.
          s.some((t) => t.id === threadId && t.naoLidas > 0)
            ? s.map((t) => (t.id === threadId ? { ...t, naoLidas: 0 } : t))
            : s,
        ),
      updateColetivo: (id, patch) => setColetivos((s) => s.map((c) => (c.id === id ? { ...c, ...patch } : c))),
      updateUser: (patch) => setUser((u) => (u ? { ...u, ...patch } : u)),
      addAtuacao: (a) => setUser((u) => (u ? { ...u, atuacoes: [...u.atuacoes, a] } : u)),
      aprovarSolicitacao: (colId, solId) =>
        setColetivos((s) =>
          s.map((c) => {
            if (c.id !== colId) return c
            const sol = c.solicitacoes?.find((x) => x.id === solId)
            if (!sol) return c
            // Novo membro entra com o cargo de menor nível do coletivo.
            const cargoBase = [...c.cargos].sort((a, b) => a.nivel - b.nivel)[0]
            return {
              ...c,
              solicitacoes: c.solicitacoes?.filter((x) => x.id !== solId),
              membros: [...c.membros, { userId: sol.userId, nome: sol.nome, cargoId: cargoBase?.id ?? '', lastSeen: 'agora', artistaId: sol.artistaId }],
            }
          }),
        ),
      recusarSolicitacao: (colId, solId) =>
        setColetivos((s) => s.map((c) => (c.id === colId ? { ...c, solicitacoes: c.solicitacoes?.filter((x) => x.id !== solId) } : c))),
    }),
    [now, user, artistas, servicos, audiovisuais, coletivos, eventos, threads],
  )

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useStore() {
  const c = useContext(Ctx)
  if (!c) throw new Error('useStore must be used within StoreProvider')
  return c
}
