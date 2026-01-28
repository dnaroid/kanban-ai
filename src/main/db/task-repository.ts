import { randomUUID } from 'node:crypto'
import { dbManager } from './index.js'
import type { KanbanTask, CreateTaskInput } from '../../shared/types/ipc'

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
      INSERT INTO tasks (
        id, project_id, board_id, column_id, title, description, 
        status, priority, type, order_in_column, tags_json, created_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)

    stmt.run(
      id,
      input.projectId,
      input.boardId,
      input.columnId,
      input.title,
      input.description ?? null,
      'open',
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
      status: 'open',
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
      SELECT 
        id, project_id as projectId, board_id as boardId, column_id as columnId, 
        title, description, description_md as descriptionMd, status, priority, 
        type, order_in_column as orderInColumn, tags_json as tagsJson, 
        assigned_agent as assignedAgent, branch_name as branchName, pr_number as prNumber,
        created_at as createdAt, updated_at as updatedAt
      FROM tasks
      WHERE board_id = ?
      ORDER BY order_in_column ASC
    `
      )
      .all(boardId) as any[]

    return rows.map((row) => ({
      ...row,
      tags: JSON.parse(row.tagsJson || '[]'),
    }))
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
      SET ${sets.join(', ')}, updated_at = ?
      WHERE id = ?
    `
    ).run(...values)
  }

  move(taskId: string, toColumnId: string, toIndex: number): void {
    const db = dbManager.connect()
    const now = new Date().toISOString()

    db.transaction(() => {
      const task = db
        .prepare('SELECT column_id, order_in_column FROM tasks WHERE id = ?')
        .get(taskId) as { column_id: string; order_in_column: number }

      if (!task) return

      db.prepare(
        'UPDATE tasks SET order_in_column = order_in_column - 1 WHERE column_id = ? AND order_in_column > ?'
      ).run(task.column_id, task.order_in_column)

      db.prepare(
        'UPDATE tasks SET order_in_column = order_in_column + 1 WHERE column_id = ? AND order_in_column >= ?'
      ).run(toColumnId, toIndex)

      db.prepare(
        'UPDATE tasks SET column_id = ?, order_in_column = ?, updated_at = ? WHERE id = ?'
      ).run(toColumnId, toIndex, now, taskId)
    })()
  }
}

export const taskRepo = new TaskRepository()
