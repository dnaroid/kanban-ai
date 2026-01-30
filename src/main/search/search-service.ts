import { dbManager } from '../db/index.js'
import type { KanbanTask, SearchFilters } from '../../shared/types/ipc'

const mapTaskRow = (row: any): KanbanTask => {
  return {
    ...row,
    description: row.description ?? undefined,
    descriptionMd: row.descriptionMd ?? '',
    assignedAgent: row.assignedAgent ?? undefined,
    tags: JSON.parse(row.tagsJson || '[]'),
  }
}

export const searchService = {
  queryTasks(query: string, filters?: SearchFilters): KanbanTask[] {
    const db = dbManager.connect()
    const where: string[] = ['tasks_fts MATCH ?']
    const params: any[] = [query]

    if (filters?.projectId) {
      where.push('t.project_id = ?')
      params.push(filters.projectId)
    }
    if (filters?.status) {
      where.push('t.status = ?')
      params.push(filters.status)
    }
    if (filters?.priority) {
      where.push('t.priority = ?')
      params.push(filters.priority)
    }
    if (filters?.dateFrom) {
      where.push('t.created_at >= ?')
      params.push(filters.dateFrom)
    }
    if (filters?.dateTo) {
      where.push('t.created_at <= ?')
      params.push(filters.dateTo)
    }

    const rows = db
      .prepare(
        `
          SELECT
            t.id,
            t.project_id as projectId,
            t.board_id as boardId,
            t.column_id as columnId,
            t.title,
            t.description,
            t.description_md as descriptionMd,
            t.status,
            t.priority,
            t.type,
            t.order_in_column as orderInColumn,
            t.tags_json as tagsJson,
            t.assigned_agent as assignedAgent,
            t.created_at as createdAt,
            t.updated_at as updatedAt,
            bm25(tasks_fts) as rank
          FROM tasks_fts
          JOIN tasks t ON t.id = tasks_fts.task_id
          WHERE ${where.join(' AND ')}
          ORDER BY rank
          LIMIT 50
        `
      )
      .all(...params) as any[]

    let tasks = rows.map(mapTaskRow)

    if (filters?.tags && filters.tags.length > 0) {
      tasks = tasks.filter((task) => filters.tags?.every((tag) => task.tags.includes(tag)))
    }

    return tasks
  },
  queryRuns(query: string, filters?: SearchFilters) {
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
        `
      )
      .all(...params) as Array<{
      id: string
      taskId: string
      projectId: string
      roleId: string
      status: string
      errorText: string
      createdAt: string
    }>
  },
  queryArtifacts(query: string, filters?: SearchFilters) {
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
        `
      )
      .all(...params) as Array<{
      id: string
      runId: string
      taskId: string
      projectId: string
      title: string
      kind: string
      createdAt: string
    }>
  },
}
