import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { rm } from 'node:fs/promises'
import { resolve } from 'node:path'
import { execFile } from 'node:child_process'

// The Tiled project under public/maps is intentionally self-contained (Tiled
// needs source + tilesets together — see DISCUSSION-domains-and-workflow.md).
// Vite copies public/ verbatim, so these authoring-only files would otherwise
// ship to production. Strip them from the build output; the runtime only needs
// the published artifacts (downtown.json, tilesets/, characters/, signs/).
const AUTHORING_ONLY = [
  'maps/maps.tiled-project',
  'maps/downtown.tmx',
  'maps/tipco.tmx',
  'maps/palette',
]

function stripMapAuthoringFiles() {
  let outDir
  return {
    name: 'strip-map-authoring-files',
    apply: 'build',
    configResolved(config) {
      outDir = config.build.outDir
    },
    async closeBundle() {
      await Promise.all(
        AUTHORING_ONLY.map((p) =>
          rm(resolve(outDir, p), { recursive: true, force: true }),
        ),
      )
    },
  }
}

// Dev-only endpoint powering the floating "architecture alignment" bar
// (src/dev/ArchScoreBar.tsx). Runs dependency-cruiser on request and returns
// the share of dependency edges that respect the rules in
// .dependency-cruiser.cjs: 100% = every import obeys the target architecture,
// lower = more edges break a rule. `apply: 'serve'` keeps it — and depcruise —
// out of production builds entirely.
function archScoreEndpoint() {
  const ARGS = ['src', '--config', '.dependency-cruiser.cjs', '--output-type', 'json']
  const BIN = 'node_modules/.bin/depcruise'
  const TTL = 15_000 // depcruise takes a few seconds; don't re-run per request
  let cache = null // { at, payload }
  let inflight = null

  function run() {
    return new Promise((res) => {
      // depcruise exits non-zero when violations exist, so ignore the exit code
      // and parse stdout regardless (execFile still hands it to us).
      execFile(BIN, ARGS, { maxBuffer: 64 * 1024 * 1024 }, (_err, stdout) => {
        try {
          const s = JSON.parse(stdout).summary
          const deps = s.totalDependenciesCruised || 0
          const violations = s.violations || []
          const rules = {}
          const byModule = {}
          for (const v of violations) {
            const name = (v.rule && v.rule.name) || 'unknown'
            rules[name] = (rules[name] || 0) + 1
            const m = byModule[v.from] || (byModule[v.from] = [])
            m.push({ to: v.to, rule: name })
          }
          // Worst-offending source modules first, so the bar can show where the
          // divergence actually concentrates.
          const offenders = Object.entries(byModule)
            .map(([from, edges]) => ({ from, count: edges.length, edges }))
            .sort((a, b) => b.count - a.count)
          const score = deps ? ((deps - violations.length) / deps) * 100 : 100
          res({
            score: Math.round(score * 10) / 10,
            violations: violations.length,
            dependencies: deps,
            modules: s.totalCruised || 0,
            rules,
            offenders,
          })
        } catch (e) {
          res({ error: String((e && e.message) || e) })
        }
      })
    })
  }

  return {
    name: 'arch-score-endpoint',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__arch-score', async (_req, res) => {
        if (!cache || Date.now() - cache.at > TTL) {
          inflight =
            inflight ||
            run().finally(() => {
              inflight = null
            })
          const payload = await inflight
          if (!payload.error) cache = { at: Date.now(), payload }
          res.statusCode = payload.error ? 500 : 200
        }
        res.setHeader('content-type', 'application/json')
        res.end(JSON.stringify(cache ? cache.payload : { error: 'unavailable' }))
      })
    },
  }
}

// Shared by both the dev server and `vite preview` (the homeserver prod build,
// issue #96). VITE_PROXY_TARGET points at the backend container under Docker
// Compose; defaults to localhost for a plain local `pnpm run dev`.
//
// No `changeOrigin`: we deliberately pass the browser's Host header through to
// the backend. Rails host authorization allows `localhost` and `.p2d.uk` (see
// backend/config/environments/development.rb), but `changeOrigin` would rewrite
// Host to the proxy target — the Docker service name `backend:3190` — which
// Rails blocks with "Blocked hosts: backend:3190".
const serve = {
  port: 5460,
  // Accept the public hostname used by the Cloudflare tunnel.
  allowedHosts: ['localhost', '.p2d.uk'],
  proxy: {
    '/api': {
      target: process.env.VITE_PROXY_TARGET || 'http://localhost:3190',
    },
  },
}

export default defineConfig({
  server: serve,
  preview: serve,
  plugins: [react(), stripMapAuthoringFiles(), archScoreEndpoint()],
})
