import Database from 'better-sqlite3'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { INIT_DB_SQL, migrations } from '../../main/db/migrations'
import { dbManager } from '../../main/db/index'

/**
 * Helper for creating temporary SQLite databases for testing
 */
export class TestDatabase {
  private db: Database.Database | null = null
  private dbPath: string | null = null
  private originalDbPath: string | undefined

  create(): Database.Database {
    const tmpDir = os.tmpdir()
    this.dbPath = path.join(
      tmpDir,
      `test-kanban-${Date.now()}-${Math.random().toString(36).slice(2)}.db`
    )

    this.originalDbPath = process.env.DB_PATH
    process.env.DB_PATH = this.dbPath

    this.db = new Database(this.dbPath)
    this.db.pragma('journal_mode = WAL')
    this.db.pragma('foreign_keys = ON')

    this.db.exec(INIT_DB_SQL)

    const latestVersion = migrations[migrations.length - 1]?.version ?? 0
    this.db.prepare('INSERT INTO schema_migrations (version) VALUES (?)').run(latestVersion)

    return this.db
  }

  /**
   * Get the database instance (must call create() first)
   */
  get(): Database.Database {
    if (!this.db) {
      throw new Error('Database not created. Call create() first.')
    }
    return this.db
  }

  /**
   * Clean up: close database and delete files
   */
  cleanup(): void {
    dbManager.disconnect()

    if (this.db) {
      try {
        this.db.close()
      } catch {
        // ignore
      }
      this.db = null
    }

    if (this.dbPath) {
      const files = [this.dbPath, `${this.dbPath}-wal`, `${this.dbPath}-shm`]
      for (const file of files) {
        if (fs.existsSync(file)) {
          fs.rmSync(file, { force: true })
        }
      }
      this.dbPath = null
    }

    if (this.originalDbPath !== undefined) {
      process.env.DB_PATH = this.originalDbPath
    } else {
      delete process.env.DB_PATH
    }
  }

  /**
   * Get the database file path
   */
  getPath(): string | null {
    return this.dbPath
  }
}

/**
 * Create a test database for use in a single test
 * Automatically cleans up after the test
 */
export function createTestDb(): { db: Database.Database; cleanup: () => void } {
  const testDb = new TestDatabase()
  const db = testDb.create()

  return {
    db,
    cleanup: () => testDb.cleanup(),
  }
}
