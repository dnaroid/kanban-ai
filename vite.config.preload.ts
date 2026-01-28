import { defineConfig } from 'vite'

export default defineConfig({
  build: {
    outDir: 'dist-electron/preload',
    lib: {
      entry: 'src/preload/preload.ts',
      formats: ['es']
    },
    rollupOptions: {
      external: ['electron']
    }
  }
})
