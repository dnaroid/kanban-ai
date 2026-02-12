import { ipcHandlers } from '../validation'
import {
  BoardGetDefaultInputSchema,
  BoardGetDefaultResponseSchema,
  BoardUpdateColumnsInputSchema,
  BoardUpdateColumnsResponseSchema,
} from '@shared/types/ipc.js'
import type { AppContext } from '../composition/create-app-context'

export function registerBoardHandlers(context: AppContext): void {
  const { getDefaultBoard, updateBoardColumns, getBoardColumns } = context

  ipcHandlers.register('board:getDefault', BoardGetDefaultInputSchema, async (_, { projectId }) => {
    const { columns = [], ...board } = getDefaultBoard(projectId)
    return BoardGetDefaultResponseSchema.parse({ board, columns })
  })

  ipcHandlers.register(
    'board:updateColumns',
    BoardUpdateColumnsInputSchema,
    async (_, { boardId, columns }) => {
      updateBoardColumns(boardId, columns)
      const updatedColumns = getBoardColumns(boardId)
      return BoardUpdateColumnsResponseSchema.parse({ columns: updatedColumns })
    }
  )
}
