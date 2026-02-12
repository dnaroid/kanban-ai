import { randomUUID } from 'node:crypto'
import { dbManager } from './index.js'
import type { Tag, TagCreateInput, TagUpdateInput } from '@shared/types/ipc.ts'

export class TagRepository {
  create(input: TagCreateInput): Tag {
    const db = dbManager.connect()
    const now = new Date().toISOString()
    const id = randomUUID()

    const existing = db
      .prepare(
        `
  SELECT id, name, color, created_at as createdAt, updated_at as updatedAt
  FROM tags
  WHERE name = ?
`
      )
      .get(input.name) as Tag | undefined

    if (existing) {
      return existing
    }

    const stmt = db.prepare(`
  INSERT INTO tags (id, name, color, created_at, updated_at)
  VALUES (?, ?, ?, ?, ?)
`)

    stmt.run(id, input.name, input.color, now, now)

    return {
      id,
      name: input.name,
      color: input.color,
      createdAt: now,
      updatedAt: now,
    }
  }

  listAll(): Tag[] {
    const db = dbManager.connect()
    const rows = db
      .prepare(
        `
  SELECT id, name, color, created_at as createdAt, updated_at as updatedAt
  FROM tags
  ORDER BY name ASC
`
      )
      .all() as Tag[]

    return rows
  }

  update(id: string, patch: TagUpdateInput): Tag {
    const db = dbManager.connect()
    const now = new Date().toISOString()

    const sets: string[] = []
    const values: any[] = []

    if (patch.name !== undefined) {
      sets.push('name = ?')
      values.push(patch.name)
    }
    if (patch.color !== undefined) {
      sets.push('color = ?')
      values.push(patch.color)
    }

    if (sets.length === 0) {
      return this.getById(id)!
    }

    values.push(now, id)
    db.prepare(
      `
UPDATE tags
SET ${sets.join(', ')},
updated_at = ?
WHERE id = ?
`
    ).run(...values)

    return this.getById(id)!
  }

  getById(id: string): Tag | null {
    const db = dbManager.connect()
    const row = db
      .prepare(
        `
  SELECT id, name, color, created_at as createdAt, updated_at as updatedAt
  FROM tags
  WHERE id = ?
`
      )
      .get(id) as Tag | undefined

    return row || null
  }

  delete(id: string): boolean {
    const db = dbManager.connect()
    const result = db.prepare('DELETE FROM tags WHERE id = ?').run(id)
    return result.changes > 0
  }
}

export const tagRepo = new TagRepository()
