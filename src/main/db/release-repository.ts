import { randomUUID } from 'node:crypto'
import { dbManager } from './index.js'

export type ReleaseRecord = {
  id: string
  projectId: string
  name: string
  status: 'draft' | 'in_progress' | 'published' | 'canceled'
  targetDate: string | null
  notesMd: string
  createdAt: string
  updatedAt: string
}

export class ReleaseRepository {
  create(input: { projectId: string; name: string; targetDate?: string | null }): ReleaseRecord {
    const db = dbManager.connect()
    const now = new Date().toISOString()
    const id = randomUUID()

    db.prepare(
      `
      INSERT INTO releases (
        id, project_id, name, status, target_date, notes_md, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `
    ).run(id, input.projectId, input.name, 'draft', input.targetDate ?? null, '', now, now)

    return {
      id,
      projectId: input.projectId,
      name: input.name,
      status: 'draft',
      targetDate: input.targetDate ?? null,
      notesMd: '',
      createdAt: now,
      updatedAt: now,
    }
  }

  listByProject(projectId: string): ReleaseRecord[] {
    const db = dbManager.connect()
    const rows = db
      .prepare(
        `
        SELECT
          id,
          project_id as projectId,
          name,
          status,
          target_date as targetDate,
          notes_md as notesMd,
          created_at as createdAt,
          updated_at as updatedAt
        FROM releases
        WHERE project_id = ?
        ORDER BY updated_at DESC
      `
      )
      .all(projectId) as ReleaseRecord[]

    return rows
  }

  getById(releaseId: string): ReleaseRecord | null {
    const db = dbManager.connect()
    const row = db
      .prepare(
        `
        SELECT
          id,
          project_id as projectId,
          name,
          status,
          target_date as targetDate,
          notes_md as notesMd,
          created_at as createdAt,
          updated_at as updatedAt
        FROM releases
        WHERE id = ?
        LIMIT 1
      `
      )
      .get(releaseId) as ReleaseRecord | undefined

    return row ?? null
  }

  update(releaseId: string, patch: Partial<ReleaseRecord>): ReleaseRecord | null {
    const db = dbManager.connect()
    const now = new Date().toISOString()

    const sets: string[] = []
    const values: unknown[] = []

    const allowed: (keyof ReleaseRecord)[] = ['name', 'status', 'targetDate', 'notesMd']
    allowed.forEach((field) => {
      if (patch[field] === undefined) return
      if (field === 'targetDate') {
        sets.push('target_date = ?')
        values.push(patch[field])
        return
      }
      if (field === 'notesMd') {
        sets.push('notes_md = ?')
        values.push(patch[field])
        return
      }
      sets.push(`${field} = ?`)
      values.push(patch[field])
    })

    if (sets.length === 0) return this.getById(releaseId)

    values.push(now, releaseId)
    db.prepare(
      `
      UPDATE releases
      SET ${sets.join(', ')}, updated_at = ?
      WHERE id = ?
    `
    ).run(...values)

    return this.getById(releaseId)
  }
}

export const releaseRepo = new ReleaseRepository()
