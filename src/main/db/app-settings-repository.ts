import { dbManager } from './index.js'

interface AppSetting {
  key: string
  value: string
  updatedAt: string
}

export class AppSettingsRepository {
  private static readonly LAST_PROJECT_KEY = 'last_project_id'
  private static readonly SIDEBAR_COLLAPSED_KEY = 'sidebar_collapsed'

  set(key: string, value: string): void {
    const db = dbManager.connect()
    const now = new Date().toISOString()
    const stmt = db.prepare(`
      INSERT INTO app_settings (key, value, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET
        value = excluded.value,
        updated_at = excluded.updated_at
    `)
    stmt.run(key, value, now)
  }

  get(key: string): string | null {
    const db = dbManager.connect()
    const stmt = db.prepare(`
      SELECT value FROM app_settings
      WHERE key = ?
    `)
    const result = stmt.get(key) as AppSetting | undefined
    return result?.value ?? null
  }

  getLastProjectId(): string | null {
    return this.get(AppSettingsRepository.LAST_PROJECT_KEY)
  }

  setLastProjectId(projectId: string): void {
    this.set(AppSettingsRepository.LAST_PROJECT_KEY, projectId)
  }

  clearLastProjectId(): void {
    const db = dbManager.connect()
    const stmt = db.prepare('DELETE FROM app_settings WHERE key = ?')
    stmt.run(AppSettingsRepository.LAST_PROJECT_KEY)
  }

  getSidebarCollapsed(): boolean {
    const value = this.get(AppSettingsRepository.SIDEBAR_COLLAPSED_KEY)
    return value === 'true'
  }

  setSidebarCollapsed(collapsed: boolean): void {
    this.set(AppSettingsRepository.SIDEBAR_COLLAPSED_KEY, String(collapsed))
  }
}

export const appSettingsRepo = new AppSettingsRepository()
