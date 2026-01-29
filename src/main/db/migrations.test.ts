import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, it, expect, vi } from 'vitest'

let mockUserDataPath = ''

vi.mock('electron', () => ({
  app: {
    getPath: () => mockUserDataPath,
  },
}))

const createTempDir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'kanban-ai-test-'))

const setupDb = async () => {
  mockUserDataPath = createTempDir()
  vi.resetModules()

  const { dbManager } = await import('./index.js')
  const { migrations } = await import('./migrations.js')

  const db = dbManager.connect()
  return {
    dbManager,
    db,
    migrations,
    cleanup: () => {
      dbManager.disconnect()
      fs.rmSync(mockUserDataPath, { recursive: true, force: true })
    },
  }
}

describe('migrations', () => {
  it('applies all migrations and creates required indexes', async () => {
    const { db, migrations, cleanup } = await setupDb()

    try {
      const applied = db.prepare('SELECT MAX(version) as version FROM schema_migrations').get() as {
        version: number
      }
      const latestVersion = Math.max(...migrations.map((migration) => migration.version))

      expect(applied.version).toBe(latestVersion)

      const columns = db.prepare("PRAGMA table_info('board_columns')").all() as { name: string }[]

      expect(columns.some((column) => column.name === 'wip_limit')).toBe(true)

      const indexNames = db
        .prepare("SELECT name FROM sqlite_master WHERE type='index'")
        .all()
        .map((row: any) => row.name)

      expect(indexNames).toEqual(expect.arrayContaining(['idx_boards_project']))
      expect(indexNames).toEqual(expect.arrayContaining(['idx_columns_board']))
      expect(indexNames).toEqual(expect.arrayContaining(['idx_tasks_board_col']))
    } finally {
      cleanup()
    }
  })
})
