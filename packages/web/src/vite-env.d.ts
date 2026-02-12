/// <reference types="vite/client" />

interface ImportMetaEnv {
  VITE_API_URL?: string
}

declare const importMeta: {
  env: ImportMetaEnv
}

export { importMeta }
