import net from 'node:net'

// Backend warm-up gate for the /api proxy (issue #226). For a few seconds
// after `docker compose restart backend` nothing listens on the target port,
// so proxied requests would surface as 502s in the browser ("CAN'T REACH THE
// VILLAGE"). Used as the proxy's `bypass` hook — Vite awaits it before
// proxying — it holds each request until a TCP connect to the target
// succeeds, so warm-up bursts just wait instead of erroring. Past the
// deadline it lets the request through to fail honestly with Vite's 502.
export function backendWarmupGate(target, { probe, retryMs = 300, deadlineMs = 30_000 } = {}) {
  const { hostname, port } = new URL(target)
  probe ??= () =>
    new Promise((resolve) => {
      const socket = net.connect({ host: hostname, port: Number(port) })
      const done = (ok) => {
        socket.destroy()
        resolve(ok)
      }
      socket.once('connect', () => done(true))
      socket.once('error', () => done(false))
      socket.setTimeout(1000, () => done(false))
    })

  // ponytail: one shared wait-loop per burst; a fresh probe per lone request
  // (~1ms local TCP connect) beats caching readiness state.
  let inflight = null
  return async function bypass() {
    inflight ??= (async () => {
      const deadline = Date.now() + deadlineMs
      while (!(await probe()) && Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, retryMs))
      }
    })().finally(() => {
      inflight = null
    })
    await inflight
  }
}
