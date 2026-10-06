import type { Config } from '@react-router/dev/config'

export default {
  appDirectory: 'src',
  ssr: true,
  // Atrás do Cloudflare/Caddy o Node recebe http://, mas o navegador envia Origin https:// do domínio público.
  // As actions próprias continuam exigindo a origem exata em APP_ORIGIN.
  allowedActionOrigins: ['circuitone-dev.magalz.space'],
} satisfies Config
