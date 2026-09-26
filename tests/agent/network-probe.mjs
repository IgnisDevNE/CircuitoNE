// Executado dentro do agente, pelo mantenedor, antes de autenticação/checkout.
import assert from 'node:assert/strict'
import net from 'node:net'
import http from 'node:http'
import { readFileSync } from 'node:fs'

const status = readFileSync('/proc/self/status', 'utf8')
assert.match(status, /^NoNewPrivs:\s+1$/m)
assert.match(status, /^CapEff:\s+0+$/m)
assert.equal(process.getuid(), 1000)

async function direct(host, port) {
  return new Promise(resolve => {
    const socket = net.createConnection({ host, port })
    socket.setTimeout(800)
    socket.once('connect', () => { socket.destroy(); resolve(true) })
    socket.once('error', () => resolve(false))
    socket.once('timeout', () => { socket.destroy(); resolve(false) })
  })
}
async function tunnel(destination) {
  return new Promise((resolve, reject) => {
    const request = http.request({ host: '10.89.240.2', port: 3128, method: 'CONNECT', path: destination, timeout: 15_000 })
    request.once('connect', (response, socket) => { socket.destroy(); resolve(response.statusCode) })
    request.once('error', reject)
    request.once('timeout', () => request.destroy(new Error('Proxy timeout')))
    request.end()
  })
}
for (const [host, port] of [['10.89.240.4', 7777], ['10.89.240.1', 80], ['10.88.0.10', 80], ['192.168.127.1', 80], ['169.254.169.254', 80], ['1.1.1.1', 443], ['::1', 443], ['2606:4700:4700::1111', 443]]) {
  assert.equal(await direct(host, port), false, `Direct access must fail: ${host}:${port}`)
}
for (const destination of ['example.com:443', 'github.com:80', '127.0.0.1:443', '10.89.240.1:443', '[::1]:443', '169.254.169.254:443']) {
  assert.equal(await tunnel(destination), 403, `Proxy must deny: ${destination}`)
}
assert.equal(await tunnel('api.github.com:443'), 200)
console.log('UID/capabilities/no-new-privileges and direct/proxied network denials verified.')
