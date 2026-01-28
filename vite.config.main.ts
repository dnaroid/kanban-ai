import { defineConfig } from 'vite'

export default defineConfig({
  build: {
    outDir: 'dist-electron/main',
    lib: {
      entry: 'src/main/main.ts',
      formats: ['es']
    },
    rollupOptions: {
      external: ['electron']
    }
  }
})
