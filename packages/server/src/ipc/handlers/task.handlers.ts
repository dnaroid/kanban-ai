import { ipcHandlers } from '../validation'
import type { AppContext } from '../composition/create-app-context'
import {
  CreateTaskInputSchema,
  TaskCreateResponseSchema,
  TaskDeleteInputSchema,
  TaskDeleteResponseSchema,
  TaskListByBoardInputSchema,
  TaskListByBoardResponseSchema,
  TaskMoveInputSchema,
  TaskMoveResponseSchema,
  TaskUpdateInputSchema,
  TaskUpdateResponseSchema,
} from '../../../../shared/dist/types/ipc'
import { ok, fail, Result, unwrap } from '../../../../shared/dist/ipc/result'
export function registerTaskHandlers(context: AppContext): void {
  const {
    createTaskUseCase,
    listTasksByBoardUseCase,
    updateTaskUseCase,
    moveTaskUseCase,
    deleteTaskUseCase,
  } = context

  ipcHandlers.register('task:create', CreateTaskInputSchema, async (_, input) => {
    const result = createTaskUseCase.execute(input)
    if (!result.ok) {
      return result
    }
    return ok(TaskCreateResponseSchema.parse(result.data))
  })

  ipcHandlers.register('task:listByBoard', TaskListByBoardInputSchema, async (_, { boardId }) => {
    const result = listTasksByBoardUseCase.execute(boardId)
    if (!result.ok) {
      return result
    }
    return ok(TaskListByBoardResponseSchema.parse(result.data))
  })

  ipcHandlers.register('task:update', TaskUpdateInputSchema, async (_, { taskId, patch }) => {
    const result = updateTaskUseCase.execute({ taskId, patch })
    if (!result.ok) {
      return result
    }
    return ok(TaskUpdateResponseSchema.parse(result.data))
  })

  ipcHandlers.register(
    'task:move',
    TaskMoveInputSchema,
    async (_, { taskId, toColumnId, toIndex }) => {
      const result = moveTaskUseCase.execute({ taskId, toColumnId, toIndex })
      if (!result.ok) {
        return result
      }
      return ok(TaskMoveResponseSchema.parse(result.data))
    }
  )

  ipcHandlers.register('task:delete', TaskDeleteInputSchema, async (_, { taskId }) => {
    const result = deleteTaskUseCase.execute({ taskId })
    if (!result.ok) {
      return result
    }
    return ok(TaskDeleteResponseSchema.parse(result.data))
  })
}
