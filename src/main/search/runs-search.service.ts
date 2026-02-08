import { dbManager } from '../db/index.js'
import type { SearchFilters } from '../../shared/types/ipc'

type RunSearchRow = {
  id: string
  taskId: string
  projectId: string
  roleId: string
  status: string
  errorText: string
  createdAt: string
}

export const runsSearchService = {
  query(query: string, filters?: SearchFilters, limit = 50, offset = 0): RunSearchRow[] {
    const db = dbManager.connect()
    const runIds = new Set<string>()

    const runIdRows = db
      .prepare('SELECT run_id as runId FROM runs_fts WHERE runs_fts MATCH ?')
      .all(query) as Array<{ runId: string }>
    runIdRows.forEach((row) => runIds.add(row.runId))

    const eventIdRows = db
      .prepare('SELECT run_id as runId FROM run_events_fts WHERE run_events_fts MATCH ?')
      .all(query) as Array<{ runId: string }>
    eventIdRows.forEach((row) => runIds.add(row.runId))

    if (runIds.size === 0) return []

    const ids = Array.from(runIds)
    const placeholders = ids.map(() => '?').join(',')
    const where: string[] = [`r.id IN (${placeholders})`]
    const params: any[] = [...ids]

    if (filters?.projectId) {
      where.push('t.project_id = ?')
      params.push(filters.projectId)
    }
    if (filters?.role) {
      where.push('r.role_id = ?')
      params.push(filters.role)
    }
    if (filters?.status) {
      where.push('r.status = ?')
      params.push(filters.status)
    }
    if (filters?.dateFrom) {
      where.push('r.created_at >= ?')
      params.push(filters.dateFrom)
    }
    if (filters?.dateTo) {
      where.push('r.created_at <= ?')
      params.push(filters.dateTo)
    }

    const safeLimit = Math.max(1, Math.min(200, limit))
    const safeOffset = Math.max(0, offset)
    params.push(safeLimit, safeOffset)

    return db
      .prepare(
        `
        SELECT
            r.id,
            r.task_id as taskId,
            t.project_id as projectId,
            r.role_id as roleId,
            r.status,
            r.error_text as errorText,
            r.created_at as createdAt
          FROM runs r
            JOIN tasks t ON t.id = r.task_id
            WHERE ${where.join(' AND ')}
            ORDER BY r.created_at DESC
            LIMIT ? OFFSET ?
        `
      )
      .all(...params) as RunSearchRow[]
  },
}
