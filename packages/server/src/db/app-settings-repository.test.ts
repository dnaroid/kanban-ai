import { describe, expect, it } from 'vitest'
import { appSettingsRepo } from './app-settings-repository'
import { createTestDb } from '../../../../src/tests/helpers/test-db'
import { dbManager } from './index'

describe('AppSettingsRepository retention policy', () => {
  it('returns defaults and persists retention settings', () => {
    const testDb = createTestDb()
    try {
      dbManager
        .connect()
        .prepare("DELETE FROM app_settings WHERE key IN ('retention_enabled', 'retention_days')")
        .run()

      expect(appSettingsRepo.getRetentionEnabled()).toBe(false)
      expect(appSettingsRepo.getRetentionDays()).toBe(30)

      appSettingsRepo.setRetentionEnabled(true)
      appSettingsRepo.setRetentionDays(45)

      expect(appSettingsRepo.getRetentionEnabled()).toBe(true)
      expect(appSettingsRepo.getRetentionDays()).toBe(45)
    } finally {
      testDb.cleanup()
    }
  })
})
