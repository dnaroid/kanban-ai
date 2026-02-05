import { dbManager } from './index.js'
import type { OpencodeModel } from '../../shared/types/ipc'
import { appSettingsRepo } from './app-settings-repository.js'

export class OpencodeModelRepository {
  getEnabled(): OpencodeModel[] {
    const db = dbManager.connect()
    const stmt = db.prepare(`
      SELECT name, enabled, difficulty
      FROM opencode_models
      WHERE enabled = 1
      ORDER BY difficulty, name
    `)

    const models = stmt.all() as Array<{ name: string; enabled: number; difficulty: string }>

    return models.map((model) => ({
      name: model.name,
      enabled: Boolean(model.enabled),
      difficulty: model.difficulty as 'easy' | 'medium' | 'hard' | 'epic',
    }))
  }

  getModelForDifficulty(difficulty: 'easy' | 'medium' | 'hard' | 'epic'): string | null {
    const defaultModel = appSettingsRepo.getDefaultModel(difficulty)
    if (defaultModel) {
      console.log('[getModelForDifficulty] Using default model from settings:', defaultModel)
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
    console.log('[getModelForDifficulty] difficulty:', difficulty, 'found model:', result?.name)
    return result?.name ?? null
  }
  getAll(): OpencodeModel[] {
    const db = dbManager.connect()
    const stmt = db.prepare(`
      SELECT name, enabled, difficulty
      FROM opencode_models
      ORDER BY name
    `)

    const models = stmt.all() as Array<{ name: string; enabled: number; difficulty: string }>

    return models.map((model) => ({
      name: model.name,
      enabled: Boolean(model.enabled),
      difficulty: model.difficulty as 'easy' | 'medium' | 'hard' | 'epic',
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
