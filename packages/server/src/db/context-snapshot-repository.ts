import { randomUUID } from 'node:crypto'
import { dbManager } from './index.js'
import type { ContextSnapshotRecord, CreateContextSnapshotInput } from './run-types'

const parseJson = (value: string | null | undefined): unknown => {
  if (!value) return null
  try {
    return JSON.parse(value)
  } catch (error) {
    console.warn('[ContextSnapshotRepo] Failed to parse JSON:', error)
    return value
  }
}

const mapSnapshotRow = (row: {
  id: string
  taskId: string
  kind: string
  summary: string
  payloadJson: string
  hash: string
  createdAt: string
}): ContextSnapshotRecord => ({
  id: row.id,
  taskId: row.taskId,
  kind: row.kind,
  summary: row.summary ?? '',
  payload: parseJson(row.payloadJson),
  hash: row.hash,
  createdAt: row.createdAt,
})

export class ContextSnapshotRepository {
  create(input: CreateContextSnapshotInput): ContextSnapshotRecord {
    const db = dbManager.connect()
    const id = randomUUID()
    const now = new Date().toISOString()
    const payloadJson = JSON.stringify(input.payload ?? null)

    db.prepare(
      `
      INSERT INTO context_snapshots (
        id, task_id, kind, summary, payload_json, hash, created_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `
    ).run(id, input.taskId, input.kind, input.summary ?? '', payloadJson, input.hash, now)

    return {
      id,
      taskId: input.taskId,
      kind: input.kind,
      summary: input.summary ?? '',
      payload: input.payload ?? null,
      hash: input.hash,
      createdAt: now,
    }
  }

  getById(snapshotId: string): ContextSnapshotRecord | null {
    const db = dbManager.connect()
    const row = db
      .prepare(
        `
        SELECT
          id,
          task_id as taskId,
          kind,
          summary,
          payload_json as payloadJson,
          hash,
          created_at as createdAt
        FROM context_snapshots
        WHERE id = ?
        LIMIT 1
      `
      )
      .get(snapshotId) as
      | {
          id: string
          taskId: string
          kind: string
          summary: string
          payloadJson: string
          hash: string
          createdAt: string
        }
      | undefined

    if (!row) return null
    return mapSnapshotRow(row)
  }

  listByTask(taskId: string): ContextSnapshotRecord[] {
    const db = dbManager.connect()
    const rows = db
      .prepare(
        `
        SELECT
          id,
          task_id as taskId,
          kind,
          summary,
          payload_json as payloadJson,
          hash,
          created_at as createdAt
        FROM context_snapshots
        WHERE task_id = ?
        ORDER BY created_at DESC
      `
      )
      .all(taskId) as {
      id: string
      taskId: string
      kind: string
      summary: string
      payloadJson: string
      hash: string
      createdAt: string
    }[]

    return rows.map(mapSnapshotRow)
  }
}

export const contextSnapshotRepo = new ContextSnapshotRepository()
