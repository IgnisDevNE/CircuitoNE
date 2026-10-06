/** Resultado de uma ação de formulário: a mensagem de sucesso só existe depois de o RPC responder sem erro. */
export type ActionResult = { ok: true; message: string } | { ok: false; error: string }
