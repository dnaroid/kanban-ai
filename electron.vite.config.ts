import { defineConfig } from 'electron-vite'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  main: {
    build: {
      rollupOptions: {
        external: ['electron', 'better-sqlite3']
      }
    }
  },
  preload: {
    build: {
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
