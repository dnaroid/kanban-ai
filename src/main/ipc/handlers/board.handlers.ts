import { ipcHandlers } from '../validation'
import {
  BoardGetDefaultInputSchema,
  BoardGetDefaultResponseSchema,
  BoardUpdateColumnsInputSchema,
  BoardUpdateColumnsResponseSchema,
} from '../../../shared/types/ipc.js'
import { boardRepo } from '../../db/board-repository'

export function registerBoardHandlers(): void {
  ipcHandlers.register('board:getDefault', BoardGetDefaultInputSchema, async (_, { projectId }) => {
    const { columns = [], ...board } = boardRepo.getDefault(projectId)
    return BoardGetDefaultResponseSchema.parse({ board, columns })
  })

  ipcHandlers.register(
    'board:updateColumns',
    BoardUpdateColumnsInputSchema,
    async (_, { boardId, columns }) => {
      boardRepo.updateColumns(boardId, columns)
      const updatedColumns = boardRepo.getColumns(boardId)
      return BoardUpdateColumnsResponseSchema.parse({ columns: updatedColumns })
    }
  )
}
