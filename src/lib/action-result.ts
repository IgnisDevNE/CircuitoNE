/**
 * Resultado de uma ação de formulário: a mensagem de sucesso só existe depois de o RPC responder sem erro.
 * `fields` traz a mensagem de cada campo recusado (chave = nome do campo do formulário).
 */
export type ActionResult = { ok: true; message: string } | { ok: false; error: string; fields?: Record<string, string> }
