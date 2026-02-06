import { dbManager } from './index.js'
import type { OpencodeModel } from '../../shared/types/ipc'
import { appSettingsRepo } from './app-settings-repository.js'

export class OpencodeModelRepository {
  private hasDifficultyColumnCache: boolean | null = null

  private hasDifficultyColumn(): boolean {
    if (this.hasDifficultyColumnCache !== null) return this.hasDifficultyColumnCache

    const db = dbManager.connect()
    const cols = db.prepare('PRAGMA table_info(opencode_models)').all() as Array<{ name?: string }>
    this.hasDifficultyColumnCache = cols.some((c) => c.name === 'difficulty')
    return this.hasDifficultyColumnCache
  }

  ensureExists(name: string): void {
    const db = dbManager.connect()

    if (this.hasDifficultyColumn()) {
      const stmt = db.prepare(
        'INSERT OR IGNORE INTO opencode_models (name, enabled, difficulty) VALUES (?, 1, ?)'
      )
      stmt.run(name, 'medium')
    } else {
      const stmt = db.prepare('INSERT OR IGNORE INTO opencode_models (name, enabled) VALUES (?, 1)')
      stmt.run(name)
    }
  }

  syncFromNames(names: string[]): { inserted: number; deleted: number } {
    const uniqueNames = Array.from(new Set(names.map((n) => n.trim()).filter(Boolean))).sort()
    const db = dbManager.connect()

    const hasDifficulty = this.hasDifficultyColumn()

    const existing = db.prepare('SELECT name FROM opencode_models').all() as Array<{ name: string }>
    const existingSet = new Set(existing.map((m) => m.name))

    let inserted = 0
    const insert = hasDifficulty
      ? db.prepare(
          "INSERT OR IGNORE INTO opencode_models (name, enabled, difficulty) VALUES (?, 1, 'medium')"
        )
      : db.prepare('INSERT OR IGNORE INTO opencode_models (name, enabled) VALUES (?, 1)')

    const tx = db.transaction(() => {
      for (const name of uniqueNames) {
        const result = hasDifficulty ? insert.run(name) : insert.run(name)
        if (result.changes > 0) inserted++
      }

      const keep = new Set(uniqueNames)
      const deleteStmt = db.prepare('DELETE FROM opencode_models WHERE name = ?')
      for (const { name } of existing) {
        if (!keep.has(name)) {
          deleteStmt.run(name)
        }
      }
    })
    tx()

    const deleted = existingSet.size - uniqueNames.filter((n) => existingSet.has(n)).length
    return { inserted, deleted }
  }

  getEnabled(): OpencodeModel[] {
    const db = dbManager.connect()
    const stmt = this.hasDifficultyColumn()
      ? db.prepare(`
      SELECT name, enabled, difficulty
      FROM opencode_models
      WHERE enabled = 1
      ORDER BY difficulty, name
    `)
      : db.prepare(`
      SELECT name, enabled
      FROM opencode_models
      WHERE enabled = 1
      ORDER BY name
    `)

    const models = stmt.all() as Array<{ name: string; enabled: number; difficulty?: string }>

    return models.map((model) => ({
      name: model.name,
      enabled: Boolean(model.enabled),
      difficulty: (model.difficulty ?? 'medium') as 'easy' | 'medium' | 'hard' | 'epic',
    }))
  }

  getModelForDifficulty(difficulty: 'easy' | 'medium' | 'hard' | 'epic'): string | null {
    const defaultModel = appSettingsRepo.getDefaultModel(difficulty)
    if (defaultModel) {
      return defaultModel
    }

    const db = dbManager.connect()
    const stmt = db.prepare(`
      SELECT name
      FROM opencode_models
      WHERE enabled = 1 AND difficulty = ?
      ORDER BY name
      LIMIT 1
    `)
    const result = stmt.get(difficulty) as { name: string } | undefined
    return result?.name ?? null
  }
  getAll(): OpencodeModel[] {
    const db = dbManager.connect()
    const stmt = this.hasDifficultyColumn()
      ? db.prepare(`
      SELECT name, enabled, difficulty
      FROM opencode_models
      ORDER BY name
    `)
      : db.prepare(`
      SELECT name, enabled
      FROM opencode_models
      ORDER BY name
    `)

    const models = stmt.all() as Array<{ name: string; enabled: number; difficulty?: string }>

    return models.map((model) => ({
      name: model.name,
      enabled: Boolean(model.enabled),
      difficulty: (model.difficulty ?? 'medium') as 'easy' | 'medium' | 'hard' | 'epic',
    }))
  }

  updateEnabled(name: string, enabled: boolean): OpencodeModel | null {
    const db = dbManager.connect()

    const stmt = db.prepare(`
      UPDATE opencode_models
      SET enabled = ?
      WHERE name = ?
    `)

    const result = stmt.run(enabled ? 1 : 0, name)

    if (result.changes === 0) {
      return null
    }

    return this.getByName(name)
  }

  updateDifficulty(
    name: string,
    difficulty: 'easy' | 'medium' | 'hard' | 'epic'
  ): OpencodeModel | null {
    const db = dbManager.connect()

    if (!this.hasDifficultyColumn()) {
      return null
    }

    const stmt = db.prepare(`
      UPDATE opencode_models
      SET difficulty = ?
      WHERE name = ?
    `)

    const result = stmt.run(difficulty, name)

    if (result.changes === 0) {
      return null
    }

    return this.getByName(name)
  }

  getByName(name: string): OpencodeModel | null {
    const db = dbManager.connect()
    const stmt = db.prepare(`
      SELECT name, enabled, difficulty
      FROM opencode_models
      WHERE name = ?
    `)

    const model = stmt.get(name) as
      | { name: string; enabled: number; difficulty: string }
      | undefined

    if (!model) {
      return null
    }

    return {
      name: model.name,
      enabled: Boolean(model.enabled),
      difficulty: model.difficulty as 'easy' | 'medium' | 'hard' | 'epic',
    }
  }
}

export const opencodeModelRepo = new OpencodeModelRepository()
