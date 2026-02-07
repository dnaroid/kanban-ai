import { randomUUID } from 'node:crypto'
import { dbManager } from './index.js'
import type { Board, BoardColumn } from '../../shared/types/ipc'

export class BoardRepository {
  getDefault(projectId: string): Board {
    return this.getOrCreateDefaultBoard(projectId)
  }

  getOrCreateDefaultBoard(projectId: string): Board {
    const db = dbManager.connect()

    const existingBoard = db
      .prepare('SELECT id, name FROM boards WHERE project_id = ? LIMIT 1')
      .get(projectId) as { id: string; name: string } | undefined

    if (existingBoard) {
      const columns = this.getColumns(existingBoard.id)
      return {
        id: existingBoard.id,
        projectId,
        name: existingBoard.name,
        columns,
      }
    }

    const boardId = randomUUID()
    const now = new Date().toISOString()

    db.transaction(() => {
      const insertBoard = db.prepare(
        `
        INSERT INTO boards (id, project_id, name, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?)
      `
      )
      insertBoard.run(boardId, projectId, 'Main Board', now, now)

      const insertColumn = db.prepare(
        `
        INSERT INTO board_columns (id, board_id, name, system_key, order_index, color, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `
      )
      const defaultColumns = [
        { name: 'Backlog', systemKey: '', color: '#3B82F6' },
        { name: 'In Progress', systemKey: 'in_progress', color: '#F59E0B' },
        { name: 'Done', systemKey: '', color: '#10B981' },
      ]
      defaultColumns.forEach((column, index) => {
        insertColumn.run(
          randomUUID(),
          boardId,
          column.name,
          column.systemKey,
          index,
          column.color,
          now,
          now
        )
      })
    })()

    return {
      id: boardId,
      projectId,
      name: 'Main Board',
      columns: this.getColumns(boardId),
    }
  }

  getColumns(boardId: string): BoardColumn[] {
    const db = dbManager.connect()
    return db
      .prepare(
        `
        SELECT id, board_id as boardId, name, system_key as systemKey, order_index as orderIndex, color
        FROM board_columns
        WHERE board_id = ?
        ORDER BY order_index ASC
      `
      )
      .all(boardId) as BoardColumn[]
  }

  updateColumns(
    boardId: string,
    columns: { id?: string; name: string; systemKey?: string; orderIndex: number; color?: string }[]
  ): void {
    const db = dbManager.connect()
    const now = new Date().toISOString()

    db.transaction(() => {
      const existingIds = db
        .prepare('SELECT id FROM board_columns WHERE board_id = ?')
        .all(boardId) as { id: string }[]
      const incomingIds = new Set(columns.filter((col) => col.id).map((col) => col.id as string))

      existingIds
        .map((row) => row.id)
        .filter((id) => !incomingIds.has(id))
        .forEach((id) => {
          db.prepare('DELETE FROM board_columns WHERE id = ? AND board_id = ?').run(id, boardId)
        })

      const updateColumn = db.prepare(
        `
        UPDATE board_columns SET name = ?, system_key = ?, order_index = ?, color = ?, updated_at = ?
        WHERE id = ? AND board_id = ?
      `
      )
      const insertColumn = db.prepare(
        `
        INSERT INTO board_columns (id, board_id, name, system_key, order_index, color, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `
      )
      columns.forEach((col) => {
        if (col.id) {
          updateColumn.run(
            col.name,
            col.systemKey || '',
            col.orderIndex,
            col.color || '',
            now,
            col.id,
            boardId
          )
        } else {
          insertColumn.run(
            randomUUID(),
            boardId,
            col.name,
            col.systemKey || '',
            col.orderIndex,
            col.color || '',
            now,
            now
          )
        }
      })
    })()
  }
}

export const boardRepo = new BoardRepository()
