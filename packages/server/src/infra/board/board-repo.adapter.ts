import type { Board, BoardColumn, BoardColumnInput } from '@shared/types/ipc'
import { type Result } from '@shared/ipc'
import { boardRepo } from '../../db/board-repository'
import { toResultError } from '../../ipc/map-error'
import type { BoardRepoPort } from '../../ports'

export class BoardRepoAdapter implements BoardRepoPort {
  getDefault(projectId: string): Result<Board> {
    try {
      return { ok: true, data: boardRepo.getDefault(projectId) }
    } catch (error) {
      return toResultError(error)
    }
  }

  getOrCreateDefaultBoard(projectId: string): Result<Board> {
    try {
      return { ok: true, data: boardRepo.getOrCreateDefaultBoard(projectId) }
    } catch (error) {
      return toResultError(error)
    }
  }

  getColumns(boardId: string): Result<BoardColumn[]> {
    try {
      return { ok: true, data: boardRepo.getColumns(boardId) }
    } catch (error) {
      return toResultError(error)
    }
  }

  updateColumns(boardId: string, columns: BoardColumnInput[]): Result<void> {
    try {
      boardRepo.updateColumns(boardId, columns)
      return { ok: true, data: undefined }
    } catch (error) {
      return toResultError(error)
    }
  }
}
