import { randomUUID } from 'node:crypto'
import { dbManager } from './index.js'
import type { CreateRunEventInput, RunEventRecord } from './run-types'

const parseJson = (value: string | null | undefined): unknown => {
  if (!value) return null
  try {
    return JSON.parse(value)
  } catch (error) {
    console.warn('[RunEventRepo] Failed to parse JSON:', error)
    return value
  }
}

const mapRunEventRow = (row: {
  id: string
  runId: string
  ts: string
  eventType: RunEventRecord['eventType']
  payloadJson: string
  messageId: string | null
}): RunEventRecord => ({
  id: row.id,
  runId: row.runId,
  ts: row.ts,
  eventType: row.eventType,
  payload: parseJson(row.payloadJson),
  messageId: row.messageId ?? undefined,
})

export class RunEventRepository {
  create(input: CreateRunEventInput): RunEventRecord {
    const db = dbManager.connect()
    const id = randomUUID()
    const ts = input.ts ?? new Date().toISOString()
    const payloadJson = JSON.stringify(input.payload ?? null)

    db.prepare(
      `
INSERT INTO run_events (id, run_id, ts, event_type, payload_json)
VALUES (?, ?, ?, ?, ?)
`
    ).run(id, input.runId, ts, input.eventType, payloadJson)

    return {
      id,
      runId: input.runId,
      ts,
      eventType: input.eventType,
      payload: input.payload ?? null,
    }
  }

  listByRun(runId: string, options: { afterTs?: string; limit?: number } = {}): RunEventRecord[] {
    const db = dbManager.connect()
    const filters: string[] = ['run_id = ?']
    const values: unknown[] = [runId]

    if (options.afterTs) {
      filters.push('ts > ?')
      values.push(options.afterTs)
    }

    let sql = `
SELECT
  id,
  run_id as runId,
  ts,
  event_type as eventType,
  payload_json as payloadJson,
  message_id as messageId
FROM run_events
WHERE ${filters.join(' AND ')}
ORDER BY ts ASC
`

    if (options.limit) {
      sql += ' LIMIT ?'
      values.push(options.limit)
    }

    const rows = db.prepare(sql).all(...values) as {
      id: string
      runId: string
      ts: string
      eventType: RunEventRecord['eventType']
      payloadJson: string
      messageId: string | null
    }[]

    return rows.map(mapRunEventRow)
  }

  upsertMessage(input: CreateRunEventInput & { messageId: string }): RunEventRecord {
    const db = dbManager.connect()
    const ts = input.ts ?? new Date().toISOString()
    const payloadJson = JSON.stringify(input.payload ?? null)

    const existingRow = db
      .prepare(
        `
SELECT id
FROM run_events
WHERE run_id = ? AND message_id = ? AND event_type = 'message'
LIMIT 1
`
      )
      .get(input.runId, input.messageId) as { id: string } | undefined

    if (existingRow) {
      db.prepare(
        `
UPDATE run_events
SET ts = ?, payload_json = ?
WHERE id = ?
`
      ).run(ts, payloadJson, existingRow.id)

      return {
        id: existingRow.id,
        runId: input.runId,
        ts,
        eventType: input.eventType,
        payload: input.payload ?? null,
        messageId: input.messageId,
      }
    } else {
      const id = randomUUID()
      db.prepare(
        `
INSERT INTO run_events (id, run_id, ts, event_type, payload_json, message_id)
VALUES (?, ?, ?, ?, ?, ?)
`
      ).run(id, input.runId, ts, input.eventType, payloadJson, input.messageId)

      return {
        id,
        runId: input.runId,
        ts,
        eventType: input.eventType,
        payload: input.payload ?? null,
        messageId: input.messageId,
      }
    }
  }
}

export const runEventRepo = new RunEventRepository()
