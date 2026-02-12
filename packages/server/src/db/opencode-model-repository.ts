import { dbManager } from './index.js'
import { appSettingsRepo } from './app-settings-repository.js'
import type { OpencodeModel } from '@shared/types/ipc'

export class OpencodeModelRepository {
  private hasDifficultyColumnCache: boolean | null = null
  private hasVariantsColumnCache: boolean | null = null

  private hasDifficultyColumn(): boolean {
    if (this.hasDifficultyColumnCache !== null) return this.hasDifficultyColumnCache

    const db = dbManager.connect()
    const cols = db.prepare('PRAGMA table_info(opencode_models)').all() as Array<{ name?: string }>
    this.hasDifficultyColumnCache = cols.some((c) => c.name === 'difficulty')
    return this.hasDifficultyColumnCache
  }

  private hasVariantsColumn(): boolean {
    if (this.hasVariantsColumnCache !== null) return this.hasVariantsColumnCache

    const db = dbManager.connect()
    const cols = db.prepare('PRAGMA table_info(opencode_models)').all() as Array<{ name?: string }>
    this.hasVariantsColumnCache = cols.some((c) => c.name === 'variants')
    return this.hasVariantsColumnCache
  }

  ensureExists(name: string): void {
    const db = dbManager.connect()

    const hasDifficulty = this.hasDifficultyColumn()
    const hasVariants = this.hasVariantsColumn()

    if (hasDifficulty && hasVariants) {
      const stmt = db.prepare(
        'INSERT OR IGNORE INTO opencode_models (name, enabled, difficulty, variants) VALUES (?, 1, ?, ?)'
      )
      stmt.run(name, 'medium', '')
    } else if (hasDifficulty) {
      const stmt = db.prepare(
        'INSERT OR IGNORE INTO opencode_models (name, enabled, difficulty) VALUES (?, 1, ?)'
      )
      stmt.run(name, 'medium')
    } else if (hasVariants) {
      const stmt = db.prepare(
        'INSERT OR IGNORE INTO opencode_models (name, enabled, variants) VALUES (?, 1, ?)'
      )
      stmt.run(name, '')
    } else {
      const stmt = db.prepare('INSERT OR IGNORE INTO opencode_models (name, enabled) VALUES (?, 1)')
      stmt.run(name)
    }
  }

  syncFromSdkModels(models: Array<{ name: string; variants: string[] }>): {
    inserted: number
    deleted: number
  } {
    const hasDifficulty = this.hasDifficultyColumn()
    const hasVariants = this.hasVariantsColumn()
    const db = dbManager.connect()

    const normalized = models
      .map((m) => ({
        name: m.name.trim(),
        variants: Array.from(new Set(m.variants.map((v) => v.trim()).filter(Boolean))).sort(),
      }))
      .filter((m) => m.name.length > 0)

    const byName = new Map<string, string>()
    for (const m of normalized) {
      byName.set(m.name, m.variants.join(','))
    }

    const keepNames = Array.from(byName.keys()).sort()

    const existing = db.prepare('SELECT name FROM opencode_models').all() as Array<{ name: string }>
    const existingSet = new Set(existing.map((m) => m.name))

    let inserted = 0

    const insert = (() => {
      if (hasDifficulty && hasVariants) {
        return db.prepare(
          "INSERT OR IGNORE INTO opencode_models (name, enabled, difficulty, variants) VALUES (?, 1, 'medium', ?)"
        )
      }
      if (hasDifficulty) {
        return db.prepare(
          "INSERT OR IGNORE INTO opencode_models (name, enabled, difficulty) VALUES (?, 1, 'medium')"
        )
      }
      if (hasVariants) {
        return db.prepare(
          'INSERT OR IGNORE INTO opencode_models (name, enabled, variants) VALUES (?, 1, ?)'
        )
      }
      return db.prepare('INSERT OR IGNORE INTO opencode_models (name, enabled) VALUES (?, 1)')
    })()

    const updateVariants = hasVariants
      ? db.prepare('UPDATE opencode_models SET variants = ? WHERE name = ?')
      : null

    const tx = db.transaction(() => {
      for (const name of keepNames) {
        const variantsCsv = byName.get(name) ?? ''

        const result = (() => {
          if (hasDifficulty && hasVariants) return insert.run(name, variantsCsv)
          if (hasVariants) return insert.run(name, variantsCsv)
          return insert.run(name)
        })()

        if (result.changes > 0) inserted++

        if (updateVariants) {
          updateVariants.run(variantsCsv, name)
        }
      }

      const keep = new Set(keepNames)
      const deleteStmt = db.prepare('DELETE FROM opencode_models WHERE name = ?')
      for (const { name } of existing) {
        if (!keep.has(name)) {
          deleteStmt.run(name)
        }
      }
    })
    tx()

    const deleted = existingSet.size - keepNames.filter((n) => existingSet.has(n)).length
    return { inserted, deleted }
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
    const hasDifficulty = this.hasDifficultyColumn()
    const hasVariants = this.hasVariantsColumn()
    const stmt = hasDifficulty
      ? db.prepare(`
  SELECT name, enabled, difficulty${hasVariants ? ', variants' : ''}
  FROM opencode_models
  WHERE enabled = 1
  ORDER BY difficulty, name
`)
      : db.prepare(`
  SELECT name, enabled${hasVariants ? ', variants' : ''}
  FROM opencode_models
  WHERE enabled = 1
  ORDER BY name
`)

    const models = stmt.all() as Array<{
      name: string
      enabled: number
      difficulty?: string
      variants?: string
    }>

    return models.map((model) => ({
      name: model.name,
      enabled: Boolean(model.enabled),
      difficulty: (model.difficulty ?? 'medium') as 'easy' | 'medium' | 'hard' | 'epic',
      variants: model.variants ?? '',
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
    const hasDifficulty = this.hasDifficultyColumn()
    const hasVariants = this.hasVariantsColumn()
    const stmt = hasDifficulty
      ? db.prepare(`
  SELECT name, enabled, difficulty${hasVariants ? ', variants' : ''}
  FROM opencode_models
  ORDER BY name
`)
      : db.prepare(`
  SELECT name, enabled${hasVariants ? ', variants' : ''}
  FROM opencode_models
  ORDER BY name
`)

    const models = stmt.all() as Array<{
      name: string
      enabled: number
      difficulty?: string
      variants?: string
    }>

    return models.map((model) => ({
      name: model.name,
      enabled: Boolean(model.enabled),
      difficulty: (model.difficulty ?? 'medium') as 'easy' | 'medium' | 'hard' | 'epic',
      variants: model.variants ?? '',
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
    const hasVariants = this.hasVariantsColumn()
    const stmt = db.prepare(`
  SELECT name, enabled, difficulty${hasVariants ? ', variants' : ''}
  FROM opencode_models
  WHERE name = ?
`)

    const model = stmt.get(name) as
      | { name: string; enabled: number; difficulty: string; variants?: string }
      | undefined

    if (!model) {
      return null
    }

    return {
      name: model.name,
      enabled: Boolean(model.enabled),
      difficulty: model.difficulty as 'easy' | 'medium' | 'hard' | 'epic',
      variants: model.variants ?? '',
    }
  }
}

export const opencodeModelRepo = new OpencodeModelRepository()
