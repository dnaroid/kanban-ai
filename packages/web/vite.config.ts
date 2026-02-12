import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '../..')

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, repoRoot, '')
  const apiUrl = (env.VITE_API_URL || 'http://127.0.0.1:3000').replace(/\/+$/u, '')

  return {
    envDir: repoRoot,
    plugins: [react()],
    server: {
      port: 5173,
      proxy: {
        '/rpc': apiUrl,
        '/events': apiUrl,
      },
    },
    resolve: {
      alias: {
        '@': path.resolve(repoRoot, 'src'),
        '@shared': path.resolve(repoRoot, 'packages/shared/src'),
      },
    },
  }
})
