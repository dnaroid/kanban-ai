import type { Config } from 'electron-builder'

const config: Config = {
  appId: 'com.kanbanai.app',
  productName: 'Kanban AI',
  directories: {
    output: 'dist'
  },
  files: [
    'dist/**/*',
    'dist-electron/**/*',
    'package.json'
  ],
  mac: {
    category: 'public.app-category.productivity'
  },
  win: {
    target: ['nsis']
  },
  linux: {
    target: ['AppImage']
  }
}

export default config
