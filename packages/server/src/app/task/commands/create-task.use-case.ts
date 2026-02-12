import type { CreateTaskInput, KanbanTask } from "@shared/types/ipc"
import * as ipcResult from '@shared/ipc/result'
import type { Result } from '@shared/ipc/result'
const { ok } = ipcResult
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
