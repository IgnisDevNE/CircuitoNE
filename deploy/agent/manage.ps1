param([ValidateSet('Prepare', 'Verify', 'Login', 'Run', 'Stop')][string]$Action = 'Verify')
$ErrorActionPreference = 'Stop'
$agentName = 'circuitone-agent'
$proxyName = 'circuitone-agent-proxy'
$agentImage = 'localhost/circuitone-agent:bootstrap'
$networkImage = 'localhost/circuitone-agent-network:bootstrap'
function Podman {
    & podman.exe @args
    if ($LASTEXITCODE -ne 0) { throw "Podman failed ($LASTEXITCODE); agent remains unavailable." }
}
function Verify {
    $config = (Podman inspect $agentName | ConvertFrom-Json)[0]
    if ($config.Config.User -ne 'node' -or !$config.HostConfig.ReadonlyRootfs -or $config.HostConfig.Privileged -or $config.HostConfig.RestartPolicy.Name -ne 'no') { throw 'Unsafe container configuration.' }
    $mounts = @($config.Mounts | ForEach-Object { "$($_.Type):$($_.Name):$($_.Destination)" } | Sort-Object)
    $expectedMounts = @('volume:circuitone-agent-cache:/home/node/.cache', 'volume:circuitone-agent-codex:/home/node/.codex', 'volume:circuitone-agent-workspace:/workspace')
    if (($mounts -join '|') -cne ($expectedMounts -join '|')) { throw 'Unexpected mount inventory; host/other volumes prohibited.' }
    if ($config.HostConfig.PortBindings.PSObject.Properties.Count -or $config.HostConfig.PidMode -ne 'private' -or $config.HostConfig.IpcMode -ne 'private') { throw 'Ports/PID/IPC sharing prohibited.' }
    $imageId = Podman image inspect $agentImage --format '{{.Id}}'
    if ($config.Image -cne $imageId) { throw 'Recreate the agent with the reviewed image.' }
    $policy = Podman exec $agentName /usr/bin/sha256sum /etc/codex/requirements.toml
    if (($policy -split ' ')[0] -ne (Get-FileHash -LiteralPath "$PSScriptRoot/requirements.toml" -Algorithm SHA256).Hash) { throw 'Unexpected Codex policy.' }
    if ($config.NetworkSettings.Networks.PSObject.Properties.Name -ne 'circuitone-agent-private') { throw 'Unexpected agent network.' }
    $nft = Podman run --rm --network "container:$agentName" --cap-drop ALL --cap-add NET_ADMIN --security-opt no-new-privileges --user 0 --read-only --tmpfs /tmp $networkImage nft --json list table inet circuitone_agent | ConvertFrom-Json
    $chains = @($nft.nftables | Where-Object chain).chain
    $rules = @($nft.nftables | Where-Object rule).rule
    if ($chains.Count -ne 1 -or $chains[0].name -ne 'output' -or $chains[0].hook -ne 'output' -or $chains[0].prio -ne 0 -or $chains[0].policy -ne 'drop' -or $rules.Count -ne 2) { throw 'Unexpected firewall structure.' }
    $expectedRules = @(
        '[{"match":{"op":"==","left":{"meta":{"key":"oifname"}},"right":"lo"}},{"accept":null}]',
        '[{"match":{"op":"==","left":{"payload":{"protocol":"ip","field":"daddr"}},"right":"10.89.240.2"}},{"match":{"op":"==","left":{"payload":{"protocol":"tcp","field":"dport"}},"right":3128}},{"accept":null}]'
    )
    for ($index = 0; $index -lt 2; $index++) {
        if ($rules[$index].chain -ne 'output' -or (ConvertTo-Json -InputObject $rules[$index].expr -Depth 10 -Compress) -cne $expectedRules[$index]) { throw 'Unexpected firewall rule.' }
    }
    $probe = Get-Content -LiteralPath "$PSScriptRoot/../../tests/agent/network-probe.mjs" -Raw
    $probe | & podman.exe exec -i $agentName node --input-type=module
    if ($LASTEXITCODE -ne 0) { throw 'Network/privilege probe failed; do not log in or issue a token.' }
}
switch ($Action) {
    Prepare {
        # Não reutilizar containers sem reaplicar o guard na namespace nova.
        & podman.exe container exists $agentName
        if ($LASTEXITCODE -eq 0) { throw 'Agent already exists; use Stop before Prepare.' }
        Podman network create --ignore --internal --disable-dns --subnet 10.89.240.0/24 circuitone-agent-private | Out-Null
        $network = (Podman network inspect circuitone-agent-private | ConvertFrom-Json)[0]
        if (!$network.internal -or $network.subnets[0].subnet -ne '10.89.240.0/24') { throw 'Unexpected private network.' }
        Podman network create --ignore circuitone-agent-egress | Out-Null
        foreach ($volume in @('workspace', 'cache', 'codex')) { Podman volume create --ignore "circuitone-agent-$volume" | Out-Null }
        try {
            Podman run --detach --name $proxyName --restart=no --network circuitone-agent-private:ip=10.89.240.2 --network circuitone-agent-egress --read-only --tmpfs /tmp --cap-drop ALL --security-opt no-new-privileges --pids-limit 64 --memory 256m $networkImage | Out-Null
            Podman run --detach --name $agentName --restart=no --ipc=private --pid=private --network circuitone-agent-private:ip=10.89.240.3 --http-proxy=false --read-only --tmpfs '/tmp:rw,nosuid,nodev,size=512m' --cap-drop ALL --security-opt no-new-privileges --pids-limit 256 --memory 3g --cpus 4 --env HTTP_PROXY=http://10.89.240.2:3128 --env HTTPS_PROXY=http://10.89.240.2:3128 --env http_proxy=http://10.89.240.2:3128 --env https_proxy=http://10.89.240.2:3128 --env 'NO_PROXY=localhost,127.0.0.1' --volume circuitone-agent-workspace:/workspace:U --volume circuitone-agent-cache:/home/node/.cache:U --volume circuitone-agent-codex:/home/node/.codex:U $agentImage | Out-Null
            Podman run --rm --network "container:$agentName" --cap-drop ALL --cap-add NET_ADMIN --security-opt no-new-privileges --user 0 --read-only --tmpfs /tmp $networkImage nft -f /etc/circuitone-guard.nft
            Verify
        } catch {
            & podman.exe rm --force $agentName $proxyName 2>$null | Out-Null
            throw
        }
    }
    Verify { Verify }
    Login { Verify; Podman exec -it $agentName circuitone-agent login --device-auth }
    Run { Verify; Podman exec -it --workdir /workspace/circuito-ne $agentName circuitone-agent }
    Stop { Podman rm --force $agentName $proxyName | Out-Null }
}
