// Send SMS Auth Hook do Supabase: recebe o código do Auth e o envia por SMS com o AWS SNS.
// Configuração (secrets da função): AWS_REGION, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY (IAM só com sns:Publish),
// SEND_SMS_HOOK_SECRETS (`v1,whsec_...`, gerado ao ativar o hook no painel) e, opcionalmente, SMS_ALLOWED_PREFIXES
// (padrão `+55`). Nada é registrado além de códigos de erro do SNS: nunca o código, o telefone ou segredos.
// Deno, não Node: não é compilado pelo tsc do projeto.
import { AwsClient } from 'npm:aws4fetch@1.0.20'
import { createHandler, type Publisher } from './handler.ts'
import { parsePrefixes, parseSecrets, snsErrorCode, snsPublishBody } from './sms.ts'

const region = Deno.env.get('AWS_REGION')
const accessKeyId = Deno.env.get('AWS_ACCESS_KEY_ID')
const secretAccessKey = Deno.env.get('AWS_SECRET_ACCESS_KEY')
const keys = parseSecrets(Deno.env.get('SEND_SMS_HOOK_SECRETS'))

const aws = region && accessKeyId && secretAccessKey ? new AwsClient({ accessKeyId, secretAccessKey, region, service: 'sns' }) : null

const publish: Publisher = async ({ phone, message }) => {
  if (!aws || !region) return { ok: false, code: 'MissingConfiguration', status: 0 }
  const response = await aws.fetch(`https://sns.${region}.amazonaws.com/`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded; charset=utf-8' },
    body: snsPublishBody(phone, message),
    // O Auth desiste do hook em poucos segundos.
    signal: AbortSignal.timeout(4000),
  })
  if (response.ok) {
    await response.body?.cancel()
    return { ok: true }
  }
  return { ok: false, code: snsErrorCode(await response.text()), status: response.status }
}

if (keys.length === 0) console.error('send-sms: SEND_SMS_HOOK_SECRETS ausente ou inválido; todas as chamadas serão recusadas.')
if (!aws) console.error('send-sms: AWS_REGION, AWS_ACCESS_KEY_ID ou AWS_SECRET_ACCESS_KEY ausente.')

Deno.serve(
  createHandler({
    keys,
    allowedPrefixes: parsePrefixes(Deno.env.get('SMS_ALLOWED_PREFIXES')),
    publish,
    log: (message, details) => console.error(message, JSON.stringify(details)),
  }),
)
