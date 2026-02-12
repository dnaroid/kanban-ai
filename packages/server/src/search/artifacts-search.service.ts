import { dbManager } from '../db/index.js'
import type { SearchFilters } from "@shared/types/ipc"

type ArtifactSearchRow = {
  id: string
  runId: string
  taskId: string
  projectId: string
  title: string
  kind: string
  createdAt: string
}

export const artifactsSearchService = {
  query(query: string, filters?: SearchFilters, limit = 50, offset = 0): ArtifactSearchRow[] {
    const db = dbManager.connect()
    const where: string[] = ['artifacts_fts MATCH ?']
    const params: any[] = [query]

    if (filters?.projectId) {
      where.push('t.project_id = ?')
      params.push(filters.projectId)
    }
    if (filters?.role) {
      where.push('r.role_id = ?')
      params.push(filters.role)
    }
    if (filters?.dateFrom) {
      where.push('a.created_at >= ?')
      params.push(filters.dateFrom)
    }
    if (filters?.dateTo) {
      where.push('a.created_at <= ?')
      params.push(filters.dateTo)
    }

    const safeLimit = Math.max(1, Math.min(200, limit))
    const safeOffset = Math.max(0, offset)
    params.push(safeLimit, safeOffset)

    return db
      .prepare(
        `
        SELECT
            a.id,
            a.run_id as runId,
            r.task_id as taskId,
            t.project_id as projectId,
            a.title,
            a.kind,
            a.created_at as createdAt
          FROM artifacts_fts
            JOIN artifacts a ON a.id = artifacts_fts.artifact_id
            JOIN runs r ON r.id = a.run_id
            JOIN tasks t ON t.id = r.task_id
          WHERE ${where.join(' AND ')}
          ORDER BY a.created_at DESC
          LIMIT ? OFFSET ?
        `
      )
      .all(...params) as ArtifactSearchRow[]
  },
}
