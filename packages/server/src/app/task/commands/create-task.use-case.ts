import type { CreateTaskInput, KanbanTask } from '../../../../../shared/dist/types/ipc'
import { ok, fail, Result, unwrap } from '../../../../../shared/dist/ipc/result'
import type { Result } from '../../../../../shared/dist/ipc/result'
import type { TaskRepoPort } from '../../../ports'

export class CreateTaskUseCase {
  constructor(private readonly taskRepo: TaskRepoPort) {}

  execute(input: CreateTaskInput): Result<{ task: KanbanTask }> {
    const taskResult = this.taskRepo.create(input)
    if (taskResult.ok === false) {
      return taskResult
    }

    return ok({ task: taskResult.data })
  }
}
