import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  server: { port: 5390, proxy: { '/api': { target: 'http://localhost:3130', changeOrigin: true } } },
  plugins: [react()],
})
