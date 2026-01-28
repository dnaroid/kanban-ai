import { ipcMain } from 'electron'
import { logger } from '../log'
import { dbManager } from '../db'

export function registerDiagnosticsHandlers(): void {
  ipcMain.handle('diagnostics:getLogs', async (_, level?: string, limit = 100) => {
    if (level) {
      return logger.getLogsByLevel(level as any, limit)
    }
    return logger.getLogs(limit)
  })

  ipcMain.handle('diagnostics:getSystemInfo', async () => {
    return {
      platform: process.platform,
      arch: process.arch,
      nodeVersion: process.versions.node,
      electronVersion: process.versions.electron,
      chromeVersion: process.versions.chrome,
      userDataPath: (await import('electron')).app.getPath('userData'),
      appVersion: (await import('electron')).app.getVersion(),
      env: process.env.NODE_ENV || 'production',
      dbPath: dbManager.connect().name,
      logsPath: logger.getLogFilePath(),
      safeStorageAvailable: (await import('electron')).safeStorage.isEncryptionAvailable()
    }
  })

  ipcMain.handle('diagnostics:getDbInfo', async () => {
    const db = dbManager.connect()

    const projectsCount = db.prepare('SELECT COUNT(*) as count FROM projects').get() as { count: number }
    const tasksCount = db.prepare('SELECT COUNT(*) as count FROM tasks').get() as { count: number }
    const dbSize = (await import('fs')).statSync(db.name).size

    return {
      projectsCount: projectsCount.count,
      tasksCount: tasksCount.count,
      dbSize,
      dbPath: db.name,
      lastMigration: db.prepare('SELECT MAX(version) as version FROM schema_version').get() as { version: number | null }
    }
  })
}
