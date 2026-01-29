import { defineConfig } from 'electron-vite'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  main: {
    build: {
      outDir: 'out/main',
      rollupOptions: {
        external: ['electron', 'better-sqlite3']
      },
      target: 'node18',
      minify: false
    }
  },
  preload: {
    build: {
      outDir: 'out/preload',
      rollupOptions: {
        external: ['electron']
      }
    }
  },
  renderer: {
    root: 'src/renderer',
    plugins: [tailwindcss()],
    build: {
      outDir: 'dist'
    }
  }
})
