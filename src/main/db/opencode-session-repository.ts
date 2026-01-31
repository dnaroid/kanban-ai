import { randomUUID } from 'node:crypto'
import { dbManager } from './index.js'

export interface OpencodeSessionRecord {
  id: string
  runId: string
  sessionId: string
  title: string
  directory: string
  status: 'active' | 'completed' | 'aborted'
  createdAt: string
  updatedAt: string
}

export interface CreateOpencodeSessionInput {
  runId: string
  sessionId: string
  title: string
  directory: string
}

const mapSessionRow = (row: {
  id: string
  run_id: string
  session_id: string
  title: string
  directory: string
  status: OpencodeSessionRecord['status']
  created_at: string
  updated_at: string
}): OpencodeSessionRecord => ({
  id: row.id,
  runId: row.run_id,
  sessionId: row.session_id,
  title: row.title,
  directory: row.directory,
  status: row.status,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
})

export class OpencodeSessionRepository {
  create(input: CreateOpencodeSessionInput): OpencodeSessionRecord {
    const db = dbManager.connect()
    const now = new Date().toISOString()
    const id = randomUUID()

    db.prepare(
      `
      INSERT INTO opencode_sessions (
        id, run_id, session_id, title, directory, status, created_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `
    ).run(id, input.runId, input.sessionId, input.title, input.directory, 'active', now, now)

    return {
      id,
      runId: input.runId,
      sessionId: input.sessionId,
      title: input.title,
      directory: input.directory,
      status: 'active',
      createdAt: now,
      updatedAt: now,
    }
  }

  getByRunId(runId: string): OpencodeSessionRecord | null {
    const db = dbManager.connect()
    const row = db
      .prepare(
        `
        SELECT
          id,
          run_id,
          session_id,
          title,
          directory,
          status,
          created_at,
          updated_at
        FROM opencode_sessions
        WHERE run_id = ?
        LIMIT 1
      `
      )
      .get(runId) as
      | {
          id: string
          run_id: string
          session_id: string
          title: string
          directory: string
          status: OpencodeSessionRecord['status']
          created_at: string
          updated_at: string
        }
      | undefined

    if (!row) return null
    return mapSessionRow(row)
  }

  getBySessionId(sessionId: string): OpencodeSessionRecord | null {
    const db = dbManager.connect()
    const row = db
      .prepare(
        `
        SELECT
          id,
          run_id,
          session_id,
          title,
          directory,
          status,
          created_at,
          updated_at
        FROM opencode_sessions
        WHERE session_id = ?
        LIMIT 1
      `
      )
      .get(sessionId) as
      | {
          id: string
          run_id: string
          session_id: string
          title: string
          directory: string
          status: OpencodeSessionRecord['status']
          created_at: string
          updated_at: string
        }
      | undefined

    if (!row) return null
    return mapSessionRow(row)
  }

  updateStatus(
    runId: string,
    status: OpencodeSessionRecord['status']
  ): OpencodeSessionRecord | null {
    const db = dbManager.connect()
    const now = new Date().toISOString()

    db.prepare(
      `
      UPDATE opencode_sessions
      SET status = ?, updated_at = ?
      WHERE run_id = ?
    `
    ).run(status, now, runId)

    return this.getByRunId(runId)
  }

  listActive(): OpencodeSessionRecord[] {
    const db = dbManager.connect()
    const rows = db
      .prepare(
        `
        SELECT
          id,
          run_id,
          session_id,
          title,
          directory,
          status,
          created_at,
          updated_at
        FROM opencode_sessions
        WHERE status = 'active'
        ORDER BY created_at DESC
      `
      )
      .all() as {
      id: string
      run_id: string
      session_id: string
      title: string
      directory: string
      status: OpencodeSessionRecord['status']
      created_at: string
      updated_at: string
    }[]

    return rows.map(mapSessionRow)
  }

  deleteBySessionId(sessionId: string): void {
    const db = dbManager.connect()
    db.prepare('DELETE FROM opencode_sessions WHERE session_id = ?').run(sessionId)
  }
}

export const opencodeSessionRepo = new OpencodeSessionRepository()
