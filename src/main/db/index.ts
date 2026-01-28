import Database from 'better-sqlite3'
import { app } from 'electron'
import path from 'path'
import fs from 'node:fs'
import { migrations } from './migrations'

const DB_PATH = path.join(app.getPath('userData'), 'kanban.db')

class DatabaseManager {
  private db: Database.Database | null = null

  connect(): Database.Database {
    if (this.db) {
      return this.db
    }

    const dbDir = path.dirname(DB_PATH)
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true })
    }

    this.db = new Database(DB_PATH)
    this.db.pragma('journal_mode = WAL')

    this.runMigrations()

    return this.db
  }

  disconnect(): void {
    if (this.db) {
      this.db.close()
      this.db = null
    }
  }

  private runMigrations(): void {
    if (!this.db) return

    // Run migration 0 to create schema_version table
    const migration0 = migrations.find((m) => m.version === 0)
    if (migration0) {
      this.db.exec(migration0.sql)
      // Insert initial version record
      this.db.prepare('INSERT OR REPLACE INTO schema_version (version) VALUES (?)').run(0)
    }

    const versionRow = this.db.prepare('SELECT version FROM schema_version').get() as
      | { version: number }
      | undefined

    const currentVersion = versionRow?.version ?? 0

    for (const migration of migrations) {
      if (migration.version > currentVersion) {
        this.db.transaction(() => {
          this.db!.exec(migration.sql)
          this.db!.prepare('INSERT OR REPLACE INTO schema_version (version) VALUES (?)').run(
            migration.version
          )
        })()
      }
    }
  }
}

export const dbManager = new DatabaseManager()
