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
    this.seedAgentRoles()

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

  private seedAgentRoles(): void {
    if (!this.db) return

    const row = this.db.prepare('SELECT COUNT(*) as count FROM agent_roles').get() as {
      count: number
    }
    if (row.count > 0) {
      return
    }

    const now = new Date().toISOString()
    const insert = this.db.prepare(
      `INSERT INTO agent_roles (id, name, description, preset_json, created_at, updated_at)
       VALUES (@id, @name, @description, @preset_json, @created_at, @updated_at)`
    )

    const roles = [
      {
        id: 'ba',
        name: 'BA',
        description: 'Business Analyst',
        preset_json: JSON.stringify({
          output: 'markdown',
          template:
            'User Story\n- As a ...\n- I want ...\n- So that ...\n\n' +
            'Acceptance Criteria\n- ...\n\n' +
            'Edge Cases\n- ...\n\n' +
            'Questions/Assumptions\n- ...',
        }),
      },
      {
        id: 'dev',
        name: 'DEV',
        description: 'Developer',
        preset_json: JSON.stringify({
          output: 'markdown',
          template: 'Implementation Plan\n- Files/modules\n- Steps\n\n' + 'Risks\n- ...',
        }),
      },
      {
        id: 'qa',
        name: 'QA',
        description: 'Quality Assurance',
        preset_json: JSON.stringify({
          output: 'markdown',
          template:
            'Test Plan\n- ...\n\n' + 'Negative Cases\n- ...\n\n' + 'Regression Checklist\n- ...',
        }),
      },
    ]

    const tx = this.db.transaction(() => {
      for (const role of roles) {
        insert.run({
          ...role,
          created_at: now,
          updated_at: now,
        })
      }
    })
    tx()

    console.log('[DB] Seeded agent roles:', roles.map((role) => role.id).join(', '))
  }
}

export const dbManager = new DatabaseManager()
