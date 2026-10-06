export type RestrictedState = 'suspended' | 'deletion_pending' | 'incomplete'

/**
 * Conta que não pode usar o portal (suspensa, em exclusão ou com cadastro incompleto): só o motivo,
 * o contato de suporte e a saída. Nenhum menu operacional.
 */
export function RestrictedAccount({
  nome,
  situacao,
  motivo,
}: {
  nome: string | null
  situacao: RestrictedState
  motivo: string | null
}) {
  return (
    <div className="space-y-4">
      <h1 className="font-display text-2xl">{nome ?? 'Minha conta'}</h1>
      {situacao === 'suspended' ? (
        <>
          <p>Conta suspensa para revisão.</p>
          <p>{motivo}</p>
        </>
      ) : situacao === 'deletion_pending' ? (
        <p>A exclusão da sua conta está em análise. As operações estão bloqueadas.</p>
      ) : (
        <>
          <p>Seu cadastro ou a confirmação dos contatos precisa ser concluído antes de usar o portal.</p>
          <a
            href="/cadastro"
            className="inline-block border border-[var(--accent)] px-4 py-2 font-mono text-sm uppercase tracking-widest hover:bg-[var(--accent)]/15"
          >
            Continuar cadastro
          </a>
        </>
      )}
      <a className="block text-[var(--accent-text)] underline" href="mailto:ignisdev@magalz.space">
        Contatar suporte
      </a>
      <form method="post" action="/sair">
        <button
          type="submit"
          className="inline-flex items-center border border-[var(--accent)] px-4 py-2 font-mono text-sm uppercase tracking-widest hover:bg-[var(--accent)]/15"
        >
          Sair
        </button>
      </form>
    </div>
  )
}
