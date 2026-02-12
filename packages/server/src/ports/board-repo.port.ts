import type { Board, BoardColumn, BoardColumnInput } from "../../shared/src/types/ipc.js'
import type { Result } from "../../shared/src/ipc'

export interface BoardRepoPort {
  getDefault(projectId: string): Result<Board>
  getOrCreateDefaultBoard(projectId: string): Result<Board>
  getColumns(boardId: string): Result<BoardColumn[]>
  updateColumns(boardId: string, columns: BoardColumnInput[]): Result<void>
}
