import { app, BrowserWindow } from 'electron'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { config } from 'dotenv'
import { createOpencodeService } from './services/opencode-service.js'
import './ipc/handlers.js'
import { registerContextMenu } from './ipc/context-menu.js'

config()

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

let mainWindow: BrowserWindow | null = null
const opencodePort = parseInt(process.env.OPENCODE_PORT || '4096', 10)
const opencodeService = createOpencodeService({ port: opencodePort })

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, '../preload/preload.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })

  registerContextMenu(mainWindow)

  if (process.env.NODE_ENV === 'development') {
    mainWindow.loadURL('http://localhost:5173')
    mainWindow.webContents.openDevTools()
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'))
  }

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

app.whenReady().then(async () => {
  try {
    await opencodeService.start()
  } catch (error) {
    console.error('[Main] Не удалось запустить OpenCode сервер:', error)
  }

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', async () => {
  if (process.env.NODE_ENV !== 'development' && opencodeService) {
    await opencodeService.shutdown()
  }

  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('before-quit', async () => {
  if (process.env.NODE_ENV !== 'development' && opencodeService) {
    await opencodeService.shutdown()
  }
})
