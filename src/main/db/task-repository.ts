import { randomUUID } from 'node:crypto'
import { dbManager } from './index.js'
import type { CreateTaskInput, KanbanTask } from '../../shared/types/ipc'

export class TaskRepository {
  create(input: CreateTaskInput): KanbanTask {
    const db = dbManager.connect()
    const now = new Date().toISOString()
    const id = randomUUID()

    const maxOrder = db
      .prepare('SELECT MAX(order_in_column) as maxOrder FROM tasks WHERE column_id = ?')
      .get(input.columnId) as { maxOrder: number | null }
    const orderIndex = (maxOrder.maxOrder ?? -1) + 1

    const stmt = db.prepare(`
        INSERT INTO tasks (id, project_id, board_id, column_id, title, description,
                           status, priority, type, order_in_column, tags_json, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)

    stmt.run(
      id,
      input.projectId,
      input.boardId,
      input.columnId,
      input.title,
      input.description ?? null,
      'todo',
      input.priority,
      input.type,
      orderIndex,
      JSON.stringify(input.tags ?? []),
      now,
      now
    )

    return {
      id,
      projectId: input.projectId,
      boardId: input.boardId,
      columnId: input.columnId,
      title: input.title,
      description: input.description,
      status: 'todo',
      priority: input.priority,
      type: input.type,
      orderInColumn: orderIndex,
      tags: input.tags ?? [],
      createdAt: now,
      updatedAt: now,
    }
  }

  listByBoard(boardId: string): KanbanTask[] {
    const db = dbManager.connect()
    const rows = db
      .prepare(
        `
            SELECT t.id,
                   t.project_id                             as projectId,
                   t.board_id                               as boardId,
                   t.column_id                              as columnId,
                   t.title,
                   t.description,
                   t.description_md                         as descriptionMd,
                   t.status,
                   t.priority,
                   t.type,
                   t.order_in_column                        as orderInColumn,
                   t.tags_json                              as tagsJson,
                   t.assigned_agent                         as assignedAgent,
                   COALESCE(tvl.branch_name, t.branch_name) as branchName,
                   t.pr_number                              as prNumber,
                   t.created_at                             as createdAt,
                   t.updated_at                             as updatedAt
            FROM tasks t
                     LEFT JOIN task_vcs_links tvl ON tvl.task_id = t.id
            WHERE board_id = ?
            ORDER BY order_in_column ASC
        `
      )
      .all(boardId) as any[]

    return rows.map((row) => ({
      ...row,
      description: row.description ?? undefined,
      descriptionMd: row.descriptionMd ?? '',
      assignedAgent: row.assignedAgent ?? undefined,
      branchName: row.branchName ?? undefined,
      prNumber: row.prNumber ?? undefined,
      status: row.status,
      tags: JSON.parse(row.tagsJson || '[]'),
    }))
  }

  getById(taskId: string): KanbanTask | null {
    const db = dbManager.connect()
    const row = db
      .prepare(
        `
            SELECT t.id,
                   t.project_id                             as projectId,
                   t.board_id                               as boardId,
                   t.column_id                              as columnId,
                   t.title,
                   t.description,
                   t.description_md                         as descriptionMd,
                   t.status,
                   t.priority,
                   t.type,
                   t.order_in_column                        as orderInColumn,
                   t.tags_json                              as tagsJson,
                   t.assigned_agent                         as assignedAgent,
                   COALESCE(tvl.branch_name, t.branch_name) as branchName,
                   t.pr_number                              as prNumber,
                   t.created_at                             as createdAt,
                   t.updated_at                             as updatedAt
            FROM tasks t
                     LEFT JOIN task_vcs_links tvl ON tvl.task_id = t.id
            WHERE id = ? LIMIT 1
        `
      )
      .get(taskId) as any | undefined

    if (!row) return null

    return {
      ...row,
      description: row.description ?? undefined,
      descriptionMd: row.descriptionMd ?? '',
      assignedAgent: row.assignedAgent ?? undefined,
      branchName: row.branchName ?? undefined,
      prNumber: row.prNumber ?? undefined,
      tags: JSON.parse(row.tagsJson || '[]'),
    }
  }

  update(id: string, patch: Partial<KanbanTask>): void {
    const db = dbManager.connect()
    const now = new Date().toISOString()

    const sets: string[] = []
    const values: any[] = []

    const allowedFields: (keyof KanbanTask)[] = [
      'title',
      'description',
      'descriptionMd',
      'status',
      'priority',
      'type',
      'columnId',
      'orderInColumn',
      'tags',
    ]

    allowedFields.forEach((field) => {
      if (patch[field] !== undefined) {
        if (field === 'tags') {
          sets.push('tags_json = ?')
          values.push(JSON.stringify(patch[field]))
        } else if (field === 'columnId') {
          sets.push('column_id = ?')
          values.push(patch[field])
        } else if (field === 'orderInColumn') {
          sets.push('order_in_column = ?')
          values.push(patch[field])
        } else if (field === 'descriptionMd') {
          sets.push('description_md = ?')
          values.push(patch[field])
        } else {
          sets.push(`${field} = ?`)
          values.push(patch[field])
        }
      }
    })

    if (sets.length === 0) return

    values.push(now, id)
    db.prepare(
      `
          UPDATE tasks
          SET ${sets.join(', ')},
              updated_at = ?
          WHERE id = ?
      `
    ).run(...values)
  }

  move(taskId: string, toColumnId: string, toIndex: number): void {
    const db = dbManager.connect()
    const now = new Date().toISOString()

    db.transaction(() => {
      const task = db.prepare('SELECT column_id FROM tasks WHERE id = ?').get(taskId) as
        | { column_id: string }
        | undefined

      if (!task) return

      const sourceColumnId = task.column_id
      const isSameColumn = sourceColumnId === toColumnId

      const normalizeIndex = (index: number, length: number) => {
        if (Number.isNaN(index)) return length
        return Math.max(0, Math.min(index, length))
      }

      const fetchColumnTaskIds = (columnId: string) => {
        const rows = db
          .prepare('SELECT id FROM tasks WHERE column_id = ? ORDER BY order_in_column ASC')
          .all(columnId) as { id: string }[]
        return rows.map((row) => row.id)
      }

      const applyOrder = (orderedIds: string[]) => {
        const updateStmt = db.prepare(
          'UPDATE tasks SET order_in_column = ?, updated_at = ? WHERE id = ?'
        )
        orderedIds.forEach((id, index) => {
          updateStmt.run(index, now, id)
        })
      }

      if (isSameColumn) {
        const orderedIds = fetchColumnTaskIds(sourceColumnId).filter((id) => id !== taskId)
        const insertIndex = normalizeIndex(toIndex, orderedIds.length)
        orderedIds.splice(insertIndex, 0, taskId)
        applyOrder(orderedIds)
        return
      }

      const sourceIds = fetchColumnTaskIds(sourceColumnId).filter((id) => id !== taskId)
      const destinationIds = fetchColumnTaskIds(toColumnId)
      const insertIndex = normalizeIndex(toIndex, destinationIds.length)

      destinationIds.splice(insertIndex, 0, taskId)

      db.prepare('UPDATE tasks SET column_id = ?, updated_at = ? WHERE id = ?').run(
        toColumnId,
        now,
        taskId
      )

      applyOrder(sourceIds)
      applyOrder(destinationIds)
    })()
  }

  delete(taskId: string): boolean {
    const db = dbManager.connect()
    const stmt = db.prepare('DELETE FROM tasks WHERE id = ?')
    const result = stmt.run(taskId)
    return result.changes > 0
  }
}

export const taskRepo = new TaskRepository()
