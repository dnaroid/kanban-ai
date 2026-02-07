import { dbManager } from './index.js'

interface AppSetting {
  key: string
  value: string
  updatedAt: string
}

export class AppSettingsRepository {
  private static readonly LAST_PROJECT_KEY = 'last_project_id'
  private static readonly SIDEBAR_COLLAPSED_KEY = 'sidebar_collapsed'
  private static readonly DEFAULT_MODEL_EASY_KEY = 'default_model_easy'
  private static readonly DEFAULT_MODEL_MEDIUM_KEY = 'default_model_medium'
  private static readonly DEFAULT_MODEL_HARD_KEY = 'default_model_hard'
  private static readonly DEFAULT_MODEL_EPIC_KEY = 'default_model_epic'
  private static readonly OHMYOPENCODE_CONFIG_PATH_KEY = 'ohmyopencode_config_path'
  private static readonly RETENTION_ENABLED_KEY = 'retention_enabled'
  private static readonly RETENTION_DAYS_KEY = 'retention_days'

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

  getDefaultModel(difficulty: 'easy' | 'medium' | 'hard' | 'epic'): string | null {
    switch (difficulty) {
      case 'easy':
        return this.get(AppSettingsRepository.DEFAULT_MODEL_EASY_KEY)
      case 'medium':
        return this.get(AppSettingsRepository.DEFAULT_MODEL_MEDIUM_KEY)
      case 'hard':
        return this.get(AppSettingsRepository.DEFAULT_MODEL_HARD_KEY)
      case 'epic':
        return this.get(AppSettingsRepository.DEFAULT_MODEL_EPIC_KEY)
      default:
        return null
    }
  }

  setDefaultModel(difficulty: 'easy' | 'medium' | 'hard' | 'epic', modelName: string): void {
    switch (difficulty) {
      case 'easy':
        this.set(AppSettingsRepository.DEFAULT_MODEL_EASY_KEY, modelName)
        break
      case 'medium':
        this.set(AppSettingsRepository.DEFAULT_MODEL_MEDIUM_KEY, modelName)
        break
      case 'hard':
        this.set(AppSettingsRepository.DEFAULT_MODEL_HARD_KEY, modelName)
        break
      case 'epic':
        this.set(AppSettingsRepository.DEFAULT_MODEL_EPIC_KEY, modelName)
        break
    }
  }

  getOhMyOpencodeConfigPath(): string | null {
    return this.get(AppSettingsRepository.OHMYOPENCODE_CONFIG_PATH_KEY)
  }

  setOhMyOpencodeConfigPath(path: string): void {
    this.set(AppSettingsRepository.OHMYOPENCODE_CONFIG_PATH_KEY, path)
  }

  getRetentionEnabled(): boolean {
    const value = this.get(AppSettingsRepository.RETENTION_ENABLED_KEY)
    if (value === null) {
      return false
    }
    return value === 'true'
  }

  setRetentionEnabled(enabled: boolean): void {
    this.set(AppSettingsRepository.RETENTION_ENABLED_KEY, String(enabled))
  }

  getRetentionDays(): number {
    const value = this.get(AppSettingsRepository.RETENTION_DAYS_KEY)
    const parsed = value ? Number(value) : Number.NaN
    if (!Number.isFinite(parsed) || parsed < 1) {
      return 30
    }
    return Math.floor(parsed)
  }

  setRetentionDays(days: number): void {
    const safeDays = Math.max(1, Math.floor(days))
    this.set(AppSettingsRepository.RETENTION_DAYS_KEY, String(safeDays))
  }
}

export const appSettingsRepo = new AppSettingsRepository()
