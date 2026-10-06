# Constrói as imagens do commit atual e recria o pod único "circuitone".
# Dev: 5186 -> Caddy :8080 -> app :3000. Produção (espera): 5187 -> Caddy :8081.
# Reiniciar depois de um reboot: podman machine start; podman pod start circuitone
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$envFile = Join-Path $PSScriptRoot 'dev.env'
if (-not (Test-Path $envFile)) { throw "Crie $envFile a partir de deploy/dev.env.example" }

$tag = (git -C $root rev-parse --short HEAD).Trim()
$app = "localhost/circuitone-app:$tag"
$proxy = "localhost/circuitone-proxy:$tag"

podman build --format docker -t $app $root
if ($LASTEXITCODE) { throw 'Falha no build do app' }
podman build --format docker -f (Join-Path $root 'deploy/Caddy.Dockerfile') -t $proxy $root
if ($LASTEXITCODE) { throw 'Falha no build do proxy' }

podman pod rm -f --ignore circuitone | Out-Null
podman pod create --name circuitone --network podman -p 5186:8080 -p 5187:8081
if ($LASTEXITCODE) { throw 'Falha ao criar o pod' }

$hardening = @('--read-only', '--tmpfs', '/tmp', '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges')
podman run -d --name circuitone-app --pod circuitone @hardening --memory 512m --env-file $envFile $app
if ($LASTEXITCODE) { throw 'Falha ao iniciar o app' }
podman run -d --name circuitone-proxy --pod circuitone @hardening --memory 128m $proxy
if ($LASTEXITCODE) { throw 'Falha ao iniciar o proxy' }

Write-Host "Pod circuitone no ar com $tag"
