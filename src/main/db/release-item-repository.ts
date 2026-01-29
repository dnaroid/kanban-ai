import { randomUUID } from 'node:crypto'
import { dbManager } from './index.js'

export type ReleaseItemRecord = {
  id: string
  releaseId: string
  taskId: string
  prId: string
  state: 'planned' | 'merged' | 'dropped'
  createdAt: string
  updatedAt: string
}

export class ReleaseItemRepository {
  listByRelease(releaseId: string): ReleaseItemRecord[] {
    const db = dbManager.connect()
    const rows = db
      .prepare(
        `
        SELECT
          id,
          release_id as releaseId,
          task_id as taskId,
          pr_id as prId,
          state,
          created_at as createdAt,
          updated_at as updatedAt
        FROM release_items
        WHERE release_id = ?
        ORDER BY created_at ASC
      `
      )
      .all(releaseId) as ReleaseItemRecord[]

    return rows
  }

  addItems(releaseId: string, items: { taskId: string; prId?: string }[]): ReleaseItemRecord[] {
    if (items.length === 0) return []
    const db = dbManager.connect()
    const now = new Date().toISOString()

    const existing = db
      .prepare(
        `
        SELECT task_id as taskId FROM release_items WHERE release_id = ?
      `
      )
      .all(releaseId) as { taskId: string }[]

    const existingTaskIds = new Set(existing.map((row) => row.taskId))
    const created: ReleaseItemRecord[] = []

    items.forEach((item) => {
      if (existingTaskIds.has(item.taskId)) return
      const id = randomUUID()
      db.prepare(
        `
        INSERT INTO release_items (
          id, release_id, task_id, pr_id, state, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `
      ).run(id, releaseId, item.taskId, item.prId ?? '', 'planned', now, now)

      created.push({
        id,
        releaseId,
        taskId: item.taskId,
        prId: item.prId ?? '',
        state: 'planned',
        createdAt: now,
        updatedAt: now,
      })
    })

    return created
  }

  updateState(releaseItemId: string, state: ReleaseItemRecord['state']): ReleaseItemRecord | null {
    const db = dbManager.connect()
    const now = new Date().toISOString()
    db.prepare(
      `
      UPDATE release_items
      SET state = ?, updated_at = ?
      WHERE id = ?
    `
    ).run(state, now, releaseItemId)

    const row = db
      .prepare(
        `
        SELECT
          id,
          release_id as releaseId,
          task_id as taskId,
          pr_id as prId,
          state,
          created_at as createdAt,
          updated_at as updatedAt
        FROM release_items
        WHERE id = ?
        LIMIT 1
      `
      )
      .get(releaseItemId) as ReleaseItemRecord | undefined

    return row ?? null
  }
}

export const releaseItemRepo = new ReleaseItemRepository()
