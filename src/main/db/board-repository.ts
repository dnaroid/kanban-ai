import { randomUUID } from 'node:crypto'
import { dbManager } from './index.js'
import type { Board, BoardColumn } from '../../shared/types/ipc'

export class BoardRepository {
  getDefault(projectId: string): Board {
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
      db.prepare(
        `
        INSERT INTO boards (id, project_id, name, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?)
      `
      ).run(boardId, projectId, 'Main Board', now, now)

      const defaultColumns = ['Backlog', 'In Progress', 'Done']
      defaultColumns.forEach((name, index) => {
        db.prepare(
          `
          INSERT INTO board_columns (id, board_id, name, order_index, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?)
        `
        ).run(randomUUID(), boardId, name, index, now, now)
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
      SELECT id, board_id as boardId, name, order_index as orderIndex
      FROM board_columns
      WHERE board_id = ?
      ORDER BY order_index ASC
    `
      )
      .all(boardId) as BoardColumn[]
  }

  updateColumns(
    boardId: string,
    columns: { id?: string; name: string; orderIndex: number }[]
  ): void {
    const db = dbManager.connect()
    const now = new Date().toISOString()

    db.transaction(() => {
      columns.forEach((col) => {
        if (col.id) {
          db.prepare(
            `
            UPDATE board_columns SET name = ?, order_index = ?, updated_at = ?
            WHERE id = ? AND board_id = ?
          `
          ).run(col.name, col.orderIndex, now, col.id, boardId)
        } else {
          db.prepare(
            `
            INSERT INTO board_columns (id, board_id, name, order_index, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?)
          `
          ).run(randomUUID(), boardId, col.name, col.orderIndex, now, now)
        }
      })
    })()
  }
}

export const boardRepo = new BoardRepository()
