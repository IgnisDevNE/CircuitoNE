import { COLLECTIVE_COLUMNS } from './collectives.server'
import { loadEnvironmentFlags } from './environment.server'
import { mapMyProfiles } from './mappers/account'
import { mapCollectiveList } from './mappers/collectives'
import {
  EXPLORE_DETAIL_COLUMNS,
  EXPLORE_KINDS,
  EXPLORE_PROFILE_COLUMNS,
  PROFILE_DB_KIND,
  mapExplorePerfis,
  type ExploreData,
  type ExploreKind,
} from './mappers/explore'
import { HttpError, unwrap, type SupabaseServerClient } from './supabase.server'

/** Quantas atuações/coletivos cada página do catálogo carrega (filtros e busca rodam sobre elas, na tela). */
export const EXPLORE_LIMIT = 500

export const isExploreKind = (value: string | undefined): value is ExploreKind => EXPLORE_KINDS.includes(value as ExploreKind)

/**
 * `/painel/explorar/:kind` (RN-06/RN-07): o catálogo interno das contas ativas. Toda conta lê a projeção não restrita
 * de todas as atuações ativas do tipo (nome, descrição, cidade, estilos) e os coletivos aprovados. Os dados profissionais
 * (contatos, cachê, presskit/portfólio, tipo de serviço) são pedidos à tabela protegida: o banco só devolve linhas ao
 * dono da atuação e ao proprietário de um coletivo aprovado com sessão MFA (`professional_reader`). Nada é filtrado aqui.
 */
export async function loadExplore(client: SupabaseServerClient, kind: string | undefined): Promise<ExploreData> {
  if (!isExploreKind(kind)) throw new HttpError(404, 'Página não encontrada.')
  if (kind === 'coletivos') {
    const rows = unwrap(await client.from('collectives').select(COLLECTIVE_COLUMNS).order('name').order('id').limit(EXPLORE_LIMIT))
    return { kind, coletivos: mapCollectiveList(rows) }
  }
  const dbKind = PROFILE_DB_KIND[kind]
  const [profiles, details, mine, styles, flags] = await Promise.all([
    client.from('profiles').select(EXPLORE_PROFILE_COLUMNS).eq('kind', dbKind).order('name').order('id').limit(EXPLORE_LIMIT),
    client.from('professional_details').select(EXPLORE_DETAIL_COLUMNS).eq('kind', dbKind).limit(EXPLORE_LIMIT),
    client.rpc('list_my_profiles'),
    kind === 'artistas'
      ? client.from('artist_styles').select('profile_id,style,substyle').order('style').order('substyle')
      : Promise.resolve({ data: [], error: null }),
    loadEnvironmentFlags(client),
  ])
  const owned = new Set(mapMyProfiles(unwrap(mine)).map((profile) => profile.id))
  return { ...mapExplorePerfis(kind, unwrap(profiles), unwrap(styles), unwrap(details), owned), mfaOpcional: flags.mfaOptional }
}
