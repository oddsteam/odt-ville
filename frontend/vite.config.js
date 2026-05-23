import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  server: {
    port: 5390,
    // Accept the public hostname used by the Cloudflare tunnel.
    allowedHosts: ['localhost', '.p2d.uk'],
    proxy: { '/api': { target: 'http://localhost:3130', changeOrigin: true } },
  },
  plugins: [react()],
})
