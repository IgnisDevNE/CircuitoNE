import { data, redirect } from 'react-router'
import { mapEventList } from './mappers/events'
import {
  mapMyCollectives,
  mapMyProfiles,
  sumUnread,
  type MeuColetivo,
  type MeuPerfil,
  type ProximoEvento,
} from './mappers/account'
import { hasAuthCookie, readAccountSession, type AccountSession } from './auth.server'
import {
  createSupabaseServerClient,
  HttpError,
  privateHeaders,
  unavailable,
  unwrap,
  type SupabaseServerClient,
} from './supabase.server'

/** Dados do layout autenticado: o shell do painel (conta ativa) ou o aviso de conta restrita. */
export type AppLayoutData =
  | { status: 'active'; nome: string; perfis: MeuPerfil[]; coletivos: MeuColetivo[]; naoLidas: number }
  | {
      status: 'restricted'
      nome: string | null
      situacao: Exclude<AccountSession['state'], 'active'>
      motivo: string | null
    }

export type AppLayoutResult = { kind: 'anonymous' } | { kind: 'ok'; data: AppLayoutData }

/**
 * Valida a sessão no servidor (getUser + `get_account_session`) e carrega o necessário para o menu do painel.
 * Conta que não está ativa (suspensa, em exclusão, incompleta) recebe só o aviso: nenhuma lista é consultada.
 */
export async function loadAppLayout(
  client: SupabaseServerClient,
  request: Request,
  headers: Headers,
): Promise<AppLayoutResult> {
  const session = await readAccountSession(client, request, headers)
  if (session.kind === 'error') throw new HttpError(503, session.message)
  if (session.kind === 'anonymous') return { kind: 'anonymous' }
  const { account } = session
  if (account.state !== 'active')
    return {
      kind: 'ok',
      data: { status: 'restricted', nome: account.name, situacao: account.state, motivo: account.reason },
    }
  const [profiles, collectives, conversations] = await Promise.all([
    client.rpc('list_my_profiles'),
    client.rpc('list_my_collectives'),
    client.rpc('list_conversations'),
  ])
  return {
    kind: 'ok',
    data: {
      status: 'active',
      nome: account.name ?? 'Minha conta',
      perfis: mapMyProfiles(unwrap(profiles)),
      coletivos: mapMyCollectives(unwrap(collectives)),
      naoLidas: sumUnread(unwrap(conversations)),
    },
  }
}

/** Loader do layout `/painel`: visitante vai para `/entrar`; respostas privadas e sem cache, com os cookies de Auth renovados. */
export async function appLayoutLoader(request: Request) {
  const headers = privateHeaders()
  let result: AppLayoutResult
  try {
    result = await loadAppLayout(createSupabaseServerClient(request, headers), request, headers)
  } catch (error) {
    const failure = error instanceof HttpError ? error : unavailable()
    throw data({ message: failure.message }, { status: failure.status, headers })
  }
  if (result.kind === 'anonymous') throw redirect('/entrar', { headers })
  return data(result.data, { headers })
}

export type DashboardData = { proximos: ProximoEvento[] }

/** Quantas atuações artísticas publicadas entram na busca de eventos (2 consultas cada). */
export const DASHBOARD_ARTISTS = 10
export const DASHBOARD_EVENTS = 20

/**
 * Próximos eventos (em andamento primeiro) em que alguma atuação artística publicada do titular está na line-up.
 * `list_events(artist)` só reconhece artistas publicados, então rascunhos não geram consultas.
 */
export async function loadDashboard(client: SupabaseServerClient): Promise<DashboardData> {
  const artists = mapMyProfiles(unwrap(await client.rpc('list_my_profiles')))
    .filter((profile) => profile.tipo === 'artista' && profile.publicado)
    .slice(0, DASHBOARD_ARTISTS)
  const found = await Promise.all(
    artists.flatMap((artist) =>
      (['ongoing', 'future'] as const).map(async (period) => ({
        artist: artist.nome,
        period,
        events: mapEventList(unwrap(await client.rpc('list_events', { period, artist: artist.id }))),
      })),
    ),
  )
  const byId = new Map<string, { item: ProximoEvento; ongoing: boolean }>()
  for (const { artist, period, events } of found)
    for (const evento of events) {
      const entry = byId.get(evento.id)
      if (!entry) byId.set(evento.id, { item: { evento, como: [artist] }, ongoing: period === 'ongoing' })
      else if (!entry.item.como.includes(artist)) entry.item.como.push(artist)
    }
  const proximos = [...byId.values()]
    .sort(
      (a, b) =>
        Number(b.ongoing) - Number(a.ongoing) ||
        a.item.evento.inicio.localeCompare(b.item.evento.inicio) ||
        a.item.evento.id.localeCompare(b.item.evento.id),
    )
    .map(({ item }) => ({ ...item, como: [...item.como].sort((a, b) => a.localeCompare(b, 'pt-BR')) }))
    .slice(0, DASHBOARD_EVENTS)
  return { proximos }
}

export type HeaderSession = { signedIn: boolean; name: string | null }

/**
 * Estado da sessão para o cabeçalho público. Sem cookies de Auth não faz nenhuma chamada; com cookies,
 * valida no servidor (nunca confia nos cookies) e repassa os cookies renovados. Qualquer falha vira "visitante":
 * o cabeçalho nunca derruba a página pública.
 */
export async function headerSessionLoader(request: Request) {
  const anonymous: HeaderSession = { signedIn: false, name: null }
  if (!hasAuthCookie(request)) return data(anonymous)
  const headers = privateHeaders()
  try {
    const session = await readAccountSession(createSupabaseServerClient(request, headers), request, headers)
    const value: HeaderSession =
      session.kind === 'account' ? { signedIn: true, name: session.account.name } : anonymous
    return data(value, { headers })
  } catch {
    return data(anonymous)
  }
}
