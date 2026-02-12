import type { Board, BoardColumn, BoardColumnInput } from '../../../shared/dist/types/ipc'
import type { Result } from '../../../shared/dist/ipc'

export interface BoardRepoPort {
  getDefault(projectId: string): Result<Board>
  getOrCreateDefaultBoard(projectId: string): Result<Board>
  getColumns(boardId: string): Result<BoardColumn[]>
  updateColumns(boardId: string, columns: BoardColumnInput[]): Result<void>
}
