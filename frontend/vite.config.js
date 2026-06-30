import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { rm } from 'node:fs/promises'
import { resolve } from 'node:path'

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
  plugins: [react(), stripMapAuthoringFiles()],
})
