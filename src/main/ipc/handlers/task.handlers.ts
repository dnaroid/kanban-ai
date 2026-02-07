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
} from '../../../shared/types/ipc.js'
import { unwrap } from '../../../shared/ipc'

export function registerTaskHandlers(context: AppContext): void {
  const {
    createTaskUseCase,
    listTasksByBoardUseCase,
    updateTaskUseCase,
    moveTaskUseCase,
    deleteTaskUseCase,
  } = context

  ipcHandlers.register('task:create', CreateTaskInputSchema, async (_, input) => {
    return TaskCreateResponseSchema.parse(unwrap(createTaskUseCase.execute(input)))
  })

  ipcHandlers.register('task:listByBoard', TaskListByBoardInputSchema, async (_, { boardId }) => {
    return TaskListByBoardResponseSchema.parse(unwrap(listTasksByBoardUseCase.execute(boardId)))
  })

  ipcHandlers.register('task:update', TaskUpdateInputSchema, async (_, { taskId, patch }) => {
    return TaskUpdateResponseSchema.parse(unwrap(updateTaskUseCase.execute({ taskId, patch })))
  })

  ipcHandlers.register(
    'task:move',
    TaskMoveInputSchema,
    async (_, { taskId, toColumnId, toIndex }) => {
      return TaskMoveResponseSchema.parse(
        unwrap(moveTaskUseCase.execute({ taskId, toColumnId, toIndex }))
      )
    }
  )

  ipcHandlers.register('task:delete', TaskDeleteInputSchema, async (_, { taskId }) => {
    return TaskDeleteResponseSchema.parse(unwrap(deleteTaskUseCase.execute({ taskId })))
  })
}
