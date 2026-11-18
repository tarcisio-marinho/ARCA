import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const api = 'http://localhost:8088'
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { proxy: { '/api': api, '/kiwix': api, '/maps': api, '/cyberchef': api } },
  build: { chunkSizeWarningLimit: 2000 },
})
