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

    const migration0 = migrations.find((m) => m.version === 0)
    if (migration0) {
      this.db.exec(migration0.sql)
    }

    const currentVersion = this.db
      .prepare('SELECT MAX(version) as version FROM schema_migrations')
      .get() as { version: number | null }
    const maxVersion = currentVersion.version ?? -1
    console.log('[DB] Current max schema version:', maxVersion)

    for (const migration of migrations) {
      if (migration.version > maxVersion) {
        console.log('[DB] Running migration version:', migration.version)
        const tx = this.db.transaction(() => {
          this.db!.exec(migration.sql)
          this.db!.prepare('INSERT INTO schema_migrations (version) VALUES (?)').run(
            migration.version
          )
        })
        tx()
        console.log('[DB] Migration version', migration.version, 'completed')
      }
    }

    const finalVersion = this.db
      .prepare('SELECT MAX(version) as version FROM schema_migrations')
      .get() as { version: number | null }
    console.log('[DB] Final max schema version:', finalVersion.version)
  }
}

export const dbManager = new DatabaseManager()
