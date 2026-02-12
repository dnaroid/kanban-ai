import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/rpc': 'http://127.0.0.1:3000/rpc',
      '/events': 'http://127.0.0.1:3000/events',
    },
  },
  resolve: {
    alias: {
      '@shared': '/Volumes/128GBSSD/Projects/kanban-ai/packages/shared/src',
    },
  },
})
