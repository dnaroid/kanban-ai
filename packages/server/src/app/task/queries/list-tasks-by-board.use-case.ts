import { ErrorCode, fail, ok, type Result } from '@shared/ipc'
import type { KanbanTask } from '@shared/types/ipc'
import type { TaskRepoPort } from '../../../ports'

export class ListTasksByBoardUseCase {
  constructor(private readonly taskRepo: TaskRepoPort) {}

  execute(boardId: string | undefined): Result<{ tasks: KanbanTask[] }> {
    if (!boardId) {
      return fail(ErrorCode.VALIDATION_ERROR, 'Board ID is required')
    }

    const tasksResult = this.taskRepo.listByBoard(boardId)
    if (tasksResult.ok === false) {
      return tasksResult
    }

    return ok({ tasks: tasksResult.data })
  }
}
