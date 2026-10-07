import { Form } from 'react-router'
import { Link } from 'react-router'
import type { FlowResult } from '../../lib/registration-forms'
import type { Taxonomia } from '../../server/mappers/account-settings'
import { Button, Panel } from '../../components/ui/primitives'
import { ProfileFields } from '../auth/ProfileFields'
import { Feedback, GeneralFeedback, errorsOf, valueOf, valuesOf } from '../auth/flow-ui'

export interface NewProfileProps {
  taxonomia: Taxonomia
  /** Nome da conta, sugerido para integrante de coletivo. */
  nome?: string
  result?: FlowResult
  busy?: boolean
}

/** `/painel/dados/nova-atuacao`: adiciona uma atuação (artista, serviços, audiovisual ou integrante) à conta. */
export function NewProfile({ taxonomia, nome, result, busy }: NewProfileProps) {
  const errors = errorsOf(result, 'create-profile')
  return (
    <div className="max-w-3xl space-y-6">
      <h1 className="font-display text-2xl font-bold text-glow">$ nova_atuacao</h1>
      <p className="font-mono text-sm text-[var(--color-muted)]">
        Adicione outra atuação à sua conta — inclusive outros projetos de artista. A cidade e o estado são os da sua conta.
      </p>
      <GeneralFeedback result={result} />
      <Panel title="nova atuação">
        <Form method="post" className="space-y-6" noValidate>
          <ProfileFields
            taxonomia={taxonomia}
            errors={errors}
            tipo={valueOf(result, 'create-profile', 'tipo')}
            nome={valueOf(result, 'create-profile', 'atuacaoNome')}
            estilos={valuesOf(result, 'create-profile', 'estilo')}
            memberHint={nome}
          />
          <Feedback result={result} intents={['create-profile']} />
          <div className="flex flex-wrap items-center gap-4">
            <Button type="submit" variant="solid" disabled={busy}>{busy ? 'criando…' : 'criar atuação'}</Button>
            <Link to="/painel/dados" className="font-mono text-sm text-[var(--color-muted)] underline">cancelar</Link>
          </div>
        </Form>
      </Panel>
    </div>
  )
}
