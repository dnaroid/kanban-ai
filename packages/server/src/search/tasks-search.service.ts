import { dbManager } from '../db/index.js'
import type { KanbanTask, SearchFilters } from '../../../shared/dist/types/ipc'

const mapTaskRow = (row: any): KanbanTask => ({
  ...row,
  description: row.description ?? undefined,
  descriptionMd: row.descriptionMd ?? '',
  assignedAgent: row.assignedAgent ?? undefined,
  tags: JSON.parse(row.tagsJson || '[]'),
})

export const tasksSearchService = {
  query(query: string, filters?: SearchFilters, limit = 50, offset = 0): KanbanTask[] {
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

    const safeLimit = Math.max(1, Math.min(200, limit))
    const safeOffset = Math.max(0, offset)
    params.push(safeLimit, safeOffset)

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
        LIMIT ? OFFSET ?
        `
      )
      .all(...params) as any[]

    let tasks = rows.map(mapTaskRow)

    if (filters?.tags && filters.tags.length > 0) {
      tasks = tasks.filter((task) => filters.tags?.every((tag) => task.tags.includes(tag)))
    }

    return tasks
  },
}
