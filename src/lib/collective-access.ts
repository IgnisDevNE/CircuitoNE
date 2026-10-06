/**
 * Perfis de acesso por coletivo (ADR 0008): o catálogo é fixo e a autoridade é o banco (`get_collective_access`).
 * Este módulo só decide o que mostrar; nenhuma ação depende de botão visível.
 */
export const PERMISSIONS = [
  'manage_requests',
  'remove_members',
  'create_events',
  'edit_events',
  'publish_events',
  'cancel_events',
  'read_messages',
  'send_messages',
] as const

export type Permissao = (typeof PERMISSIONS)[number]

/** Permissões que dão acesso ao painel de gestão de eventos (rascunhos e cancelados incluídos). */
export const EVENT_PERMISSIONS: readonly Permissao[] = ['create_events', 'edit_events', 'publish_events', 'cancel_events']

/** Rótulos pt-BR do catálogo (ADR 0008), na ordem em que as permissões aparecem nos formulários. */
export const PERMISSION_LABELS: Record<Permissao, string> = {
  manage_requests: 'Gerir pedidos de entrada',
  remove_members: 'Remover membros comuns',
  create_events: 'Criar eventos',
  edit_events: 'Editar eventos',
  publish_events: 'Publicar eventos',
  cancel_events: 'Cancelar eventos',
  read_messages: 'Ler mensagens do coletivo',
  send_messages: 'Enviar mensagens pelo coletivo',
}

export type CollectiveAccess = { dono: boolean; permissoes: Permissao[] }

export const isPermission = (value: unknown): value is Permissao =>
  typeof value === 'string' && (PERMISSIONS as readonly string[]).includes(value)

export const can = (access: CollectiveAccess, permission: Permissao) => access.permissoes.includes(permission)

export type CollectiveSection = { key: string; to: string; label: string }

/**
 * Seções do coletivo que o acesso libera. Painel básico: todo membro de coletivo aprovado (RN-18);
 * mensagens exigem "ler mensagens" (RN-29); editar, perfil público e perfis de acesso são do proprietário (RN-17/19).
 */
export function collectiveSections(id: string, access: CollectiveAccess, pendentes?: number | null): CollectiveSection[] {
  const base = `/coletivo/${id}`
  const sections: (CollectiveSection & { allowed: boolean })[] = [
    { key: 'painel', to: `${base}/painel`, label: 'Dashboard', allowed: true },
    { key: 'mensagens', to: `${base}/mensagens`, label: 'Mensagens', allowed: can(access, 'read_messages') },
    {
      key: 'solicitacoes',
      to: `${base}/solicitacoes`,
      label: pendentes ? `Solicitações (${pendentes})` : 'Solicitações',
      allowed: can(access, 'manage_requests'),
    },
    { key: 'eventos', to: `${base}/eventos/novo`, label: 'Criar Evento', allowed: can(access, 'create_events') },
    { key: 'membros', to: `${base}/membros`, label: 'Membros', allowed: access.dono || can(access, 'remove_members') },
    { key: 'editar', to: `${base}/editar`, label: 'Editar', allowed: access.dono },
    { key: 'perfil', to: `${base}/perfil`, label: 'Perfil Público', allowed: access.dono },
  ]
  return sections.filter((section) => section.allowed).map(({ key, to, label }) => ({ key, to, label }))
}
