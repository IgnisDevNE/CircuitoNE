$ErrorActionPreference = 'Stop'

# Resume existing resources only: no build, deployment, credentials or service restart.
$machineState = podman machine inspect podman-machine-default --format '{{.State}}'
if ($LASTEXITCODE -ne 0) { throw 'Cannot inspect the existing Podman machine' }
if ($machineState.Trim() -eq 'stopped') {
    podman machine start podman-machine-default | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'Cannot start the existing Podman machine' }
} elseif ($machineState.Trim() -ne 'running') {
    throw 'Podman machine is not ready; no resources changed'
}

podman pod start circuitone-hosting-pod circuitone-production-pod | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Cannot start the existing CircuitoNE pods' }
