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
      mode: (await import('electron')).app.isPackaged ? 'production' : 'development',
      dbPath: dbManager.connect().name,
      logsPath: logger.getLogFilePath(),
      safeStorageAvailable: (await import('electron')).safeStorage.isEncryptionAvailable(),
    }
  })

  ipcMain.handle('diagnostics:getDbInfo', async () => {
    const db = dbManager.connect()

    let projectsCount = 0
    let tasksCount = 0
    let lastMigration = 0

    try {
      const pCount = db.prepare('SELECT COUNT(*) as count FROM projects').get() as { count: number }
      projectsCount = pCount.count
    } catch {
      logger.warn('Failed to get projects count', 'Diagnostics')
    }

    try {
      const tCount = db.prepare('SELECT COUNT(*) as count FROM tasks').get() as { count: number }
      tasksCount = tCount.count
    } catch {
      logger.warn('Failed to get tasks count', 'Diagnostics')
    }

    try {
      const migration = db.prepare('SELECT MAX(version) as version FROM schema_version').get() as {
        version: number | null
      }
      lastMigration = migration.version ?? 0
    } catch {
      logger.warn('Failed to get last migration version', 'Diagnostics')
    }

    let dbSize = 0
    try {
      dbSize = (await import('fs')).statSync(db.name).size
    } catch {
      logger.warn('Failed to get db size', 'Diagnostics')
    }

    return {
      projectsCount,
      tasksCount,
      dbSize,
      dbPath: db.name,
      lastMigration,
    }
  })

  ipcMain.handle('diagnostics:getLogTail', async (_, lines = 200) => {
    try {
      const fs = await import('fs/promises')
      const path = logger.getLogFilePath()
      const content = await fs.readFile(path, 'utf-8')
      const allLines = content.split('\n').filter(Boolean)
      return allLines.slice(-lines)
    } catch (error) {
      logger.error('Failed to tail logs', 'Diagnostics', error)
      return []
    }
  })
}
