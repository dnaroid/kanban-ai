import { randomUUID } from 'node:crypto'
import { dbManager } from './index.js'
import type { Project, CreateProjectInput } from "@shared/types/ipc"

export class ProjectRepository {
  create(input: CreateProjectInput): Project {
    const db = dbManager.connect()
    const now = new Date().toISOString()
    const id = randomUUID()
    const color = input.color ?? ''

    const stmt = db.prepare(`
  INSERT INTO projects (id, name, path, color, created_at, updated_at)
  VALUES (?, ?, ?, ?, ?, ?)
`)

    try {
      const result = stmt.run(id, input.name, input.path, color, now, now)
      console.log('[ProjectRepo] Insert result:', result)
    } catch (error) {
      console.error('[ProjectRepo] Insert failed:', error)
      throw error
    }

    return {
      id,
      name: input.name,
      path: input.path,
      color,
      createdAt: now,
      updatedAt: now,
    }
  }

  getAll(): Project[] {
    const db = dbManager.connect()
    const stmt = db.prepare(`
  SELECT id, name, path, color, created_at as createdAt, updated_at as updatedAt
  FROM projects
  ORDER BY updated_at DESC
`)

    return stmt.all() as Project[]
  }

  getById(id: string): Project | null {
    const db = dbManager.connect()
    const stmt = db.prepare(`
  SELECT id, name, path, color, created_at as createdAt, updated_at as updatedAt
  FROM projects
  WHERE id = ?
`)

    return stmt.get(id) as Project | null
  }

  update(id: string, updates: Partial<Pick<Project, 'name' | 'path' | 'color'>>): Project | null {
    const db = dbManager.connect()
    const now = new Date().toISOString()

    const sets: string[] = []
    const values: unknown[] = []

    if (updates.name !== undefined) {
      sets.push('name = ?')
      values.push(updates.name)
    }
    if (updates.path !== undefined) {
      sets.push('path = ?')
      values.push(updates.path)
    }
    if (updates.color !== undefined) {
      sets.push('color = ?')
      values.push(updates.color)
    }

    if (sets.length === 0) return this.getById(id)

    values.push(now, id)

    const stmt = db.prepare(`
  UPDATE projects
  SET ${sets.join(', ')}, updated_at = ?
  WHERE id = ?
`)

    stmt.run(...values)

    return this.getById(id)
  }

  delete(id: string): boolean {
    const db = dbManager.connect()
    const stmt = db.prepare('DELETE FROM projects WHERE id = ?')
    const result = stmt.run(id)
    return result.changes > 0
  }
}

export const projectRepo = new ProjectRepository()
