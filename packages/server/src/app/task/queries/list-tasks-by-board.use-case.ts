import * as ipcErrors from '../../../../../shared/dist/ipc/errors'
const { ErrorCode } = ipcErrors
import { ok, fail, Result, unwrap } from '../../../../../shared/dist/ipc/result'
import type { Result } from '../../../../../shared/dist/ipc/result'
import type { KanbanTask } from '../../../../../shared/dist/types/ipc'
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
