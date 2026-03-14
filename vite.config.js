import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import vercelApiPlugin from './vite-api-plugin.js'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), vercelApiPlugin()],
  server: {
    proxy: {
      '/health': 'http://localhost:8000',
      '/environment': 'http://localhost:8000',
      '/chat': 'http://localhost:8000',
      '/predict': 'http://localhost:8000',
      '/recommend': 'http://localhost:8000',
      '/retrain': 'http://localhost:8000',
    },
  },
})
