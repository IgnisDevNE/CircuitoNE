import { describe, expect, it } from 'vitest'
import {
  closeWindow,
  dropOutgoing,
  emptyDock,
  expandWindow,
  isRetryable,
  markFailed,
  markRetry,
  markSent,
  MAX_CHAT_WINDOWS,
  mergeMessages,
  minimizeWindow,
  nameWindow,
  newOutgoing,
  openWindow,
  parseDock,
  pendingOutgoing,
  pruneDelivered,
  serializeDock,
  type ChatDockState,
  type Outgoing,
} from '../../src/lib/chat'
import type { Mensagem } from '../../src/server/mappers/messages'

const A = 'profile:02000000-0000-4000-8000-000000000001'
const B = 'collective:05000000-0000-4000-8000-000000000001'
const C = 'profile:02000000-0000-4000-8000-000000000007'
const D = 'profile:02000000-0000-4000-8000-000000000009'

const paras = (state: ChatDockState) => state.windows.map((window) => [window.para, window.minimized])

describe('estado das janelas do chat', () => {
  it('abre expandida e dá o foco (nonce) ao campo de mensagem', () => {
    const state = openWindow(emptyDock, A, 'Artista')
    expect(state.windows).toEqual([{ para: A, nome: 'Artista', minimized: false, focusNonce: 1 }])
  })

  it('abrir outra janela minimiza as demais: só uma fica expandida', () => {
    const state = openWindow(openWindow(emptyDock, A), B)
    expect(paras(state)).toEqual([[A, true], [B, false]])
  })

  it('abrir de novo a mesma janela a mantém no lugar, expande e sobe o nonce (o foco volta ao campo)', () => {
    let state = openWindow(openWindow(emptyDock, A, 'Artista'), B)
    state = openWindow(state, A)
    expect(paras(state)).toEqual([[A, false], [B, true]])
    expect(state.windows[0]).toMatchObject({ nome: 'Artista', focusNonce: 2 })
  })

  it('o limite de janelas fecha a mais antiga', () => {
    let state = emptyDock
    for (const para of [A, B, C, D]) state = openWindow(state, para)
    expect(MAX_CHAT_WINDOWS).toBe(3)
    expect(state.windows.map((window) => window.para)).toEqual([B, C, D])
  })

  it('minimiza, expande, fecha e dá nome', () => {
    let state = openWindow(openWindow(emptyDock, A), B)
    state = minimizeWindow(state, B)
    expect(paras(state)).toEqual([[A, true], [B, true]])
    state = expandWindow(state, A)
    expect(paras(state)).toEqual([[A, false], [B, true]])
    expect(expandWindow(state, C)).toBe(state)
    state = nameWindow(state, B, 'Coletivo')
    expect(state.windows[1].nome).toBe('Coletivo')
    expect(nameWindow(state, B, 'Coletivo')).toBe(state)
    expect(closeWindow(state, A).windows.map((window) => window.para)).toEqual([B])
  })

  it('persiste só o interlocutor, o nome e se está minimizada (nunca o foco, mensagens ou rascunhos)', () => {
    const state = openWindow(openWindow(emptyDock, A, 'Artista'), B, 'Coletivo')
    expect(JSON.parse(serializeDock(state))).toEqual([
      { para: A, nome: 'Artista', minimized: true },
      { para: B, nome: 'Coletivo', minimized: false },
    ])
    const restored = parseDock(serializeDock(state))
    expect(paras(restored)).toEqual([[A, true], [B, false]])
    expect(restored.windows.every((window) => window.focusNonce === 0)).toBe(true)
  })

  it('valores guardados inválidos ou adulterados são descartados', () => {
    for (const raw of [null, undefined, '', 'não é json', '{}', '"x"', '[1,"a",null]', JSON.stringify([{ para: 'user:1' }, { para: 'profile:x' }, { para: `${A}:extra` }])])
      expect(parseDock(raw)).toEqual(emptyDock)
    // Duplicadas, nome grande demais e mais de uma expandida são normalizados.
    const raw = JSON.stringify([
      { para: A, nome: 'x'.repeat(500), minimized: false },
      { para: A, nome: 'repetida', minimized: true },
      { para: B, nome: 'ok', minimized: false },
    ])
    const state = parseDock(raw)
    expect(paras(state)).toEqual([[A, true], [B, false]])
    expect(state.windows[0].nome).toBeNull()
  })
})

describe('mergeMessages', () => {
  const msg = (n: number): Mensagem => ({
    id: `0e000000-0000-4000-8000-${String(n).padStart(12, '0')}`,
    texto: `m${n}`,
    criadaEm: '2026-10-06T10:00:00.000Z',
    cursor: `2026-10-06T10:00:0${n}.000001+00:00`,
    autor: { kind: 'profile', id: 'x', nome: 'Alguém' },
  })

  it('une sem duplicar e ordena pelo instante do banco, com as mais antigas já carregadas preservadas', () => {
    const merged = mergeMessages([msg(1), msg(2), msg(3)], [msg(3), msg(5), msg(4)])
    expect(merged.map((m) => m.texto)).toEqual(['m1', 'm2', 'm3', 'm4', 'm5'])
  })

  it('o mesmo instante desempata pelo id', () => {
    const a = { ...msg(2), cursor: msg(1).cursor }
    expect(mergeMessages([a], [msg(1)]).map((m) => m.id)).toEqual([msg(1).id, msg(2).id])
  })
})

describe('mensagens em envio (otimista)', () => {
  const via = `${A}>${C}`
  const draft = (n: number) => newOutgoing({ requestId: `req-${n}`, via, body: `texto ${n}`, conversationId: null })
  const real = (id: string): Mensagem => ({
    id,
    texto: 'x',
    criadaEm: '2026-10-06T10:00:00.000Z',
    cursor: '2026-10-06T10:00:00.000001+00:00',
    autor: { kind: 'profile', id: 'x', nome: 'Alguém' },
  })
  const REAL = '0e000000-0000-4000-8000-000000000001'

  it('nasce "enviando", com a chave, a rota e o texto que serão repetidos no reenvio', () => {
    const expected: Outgoing = { requestId: 'req-1', via, body: 'texto 1', conversationId: null, status: 'sending', error: null, retryable: false, messageId: null }
    expect(draft(1)).toEqual(expected)
  })

  it('só falha de rede, limite de envio e erro do servidor valem uma nova tentativa', () => {
    for (const status of [0, 429, 500, 503]) expect(isRetryable(status)).toBe(true)
    for (const status of [400, 401, 403, 404, 409, 422]) expect(isRetryable(status)).toBe(false)
  })

  it('falhou: o item fica com o motivo; "tentar de novo" volta a enviando sem mudar chave, rota nem texto', () => {
    const failed = markFailed([draft(1), draft(2)], 'req-1', 'Sem conexão', true)
    expect(failed.map((item) => item.status)).toEqual(['failed', 'sending'])
    expect(failed[0]).toMatchObject({ error: 'Sem conexão', retryable: true })
    const retried = markRetry(failed, 'req-1')
    expect(retried[0]).toMatchObject({ requestId: 'req-1', via, body: 'texto 1', status: 'sending', error: null })
  })

  it('recusa que não passa sozinha não pode ser reenviada, e só o que falhou é reenviado', () => {
    const refused = markFailed([draft(1)], 'req-1', 'Esta conversa está bloqueada', false)
    expect(markRetry(refused, 'req-1')).toEqual(refused)
    const sending = [draft(2)]
    expect(markRetry(sending, 'req-2')).toEqual(sending)
  })

  it('confirmado com o id da mensagem real: fica até a real chegar, e então some (sem duplicar)', () => {
    const sent = markSent([draft(1), draft(2)], 'req-1', REAL)
    expect(sent[0]).toMatchObject({ status: 'sent', messageId: REAL })
    expect(pendingOutgoing(sent, [real('0e000000-0000-4000-8000-000000000009')]).map((item) => item.requestId)).toEqual(['req-1', 'req-2'])
    expect(pendingOutgoing(sent, [real(REAL)]).map((item) => item.requestId)).toEqual(['req-2'])
    const pruned = pruneDelivered(sent, [real(REAL)])
    expect(pruned.map((item) => item.requestId)).toEqual(['req-2'])
    // Nada a podar: a mesma lista (sem renderização à toa).
    expect(pruneDelivered(pruned, [real(REAL)])).toBe(pruned)
  })

  it('confirmado sem o id da mensagem real: o item sai na hora (a lista real é relida em seguida)', () => {
    expect(markSent([draft(1), draft(2)], 'req-1', null).map((item) => item.requestId)).toEqual(['req-2'])
  })

  it('uma falha nunca some sozinha, mesmo que haja mensagens reais; só "descartar" a tira', () => {
    const failed = markFailed([draft(1)], 'req-1', 'x', true)
    expect(pendingOutgoing(failed, [real(REAL)])).toHaveLength(1)
    expect(dropOutgoing(failed, 'req-1')).toEqual([])
    expect(dropOutgoing(failed, 'outra')).toEqual(failed)
  })
})
