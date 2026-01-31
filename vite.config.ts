import {defineConfig} from "vite"
import react from "@vitejs/plugin-react"
import electron from "vite-plugin-electron"

export default defineConfig({
  plugins: [
    react(),
    electron([
      {
        entry: "src/main/main.ts",
        vite: {
          build: {
            outDir: "dist-electron/main",
            rollupOptions: {
              external: ["electron"]
            }
          }
        }
      },
      {
        entry: "src/preload/preload.ts",
        onstart(args) {
          args.reload()
        },
        vite: {
          build: {
            outDir: "dist-electron/preload",
            rollupOptions: {
              external: ["electron"]
            }
          }
        }
      }
    ])
  ],
  resolve: {
    alias: {
      "@": "/src"
    }
  },
  server: {
    port: 5173
  }
})
