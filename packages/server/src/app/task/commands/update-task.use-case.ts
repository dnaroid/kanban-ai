import * as ipcErrors from '@shared/ipc/errors'
const { ErrorCode } = ipcErrors
import * as ipcResult from '@shared/ipc/result'
import type { Result } from '@shared/ipc/result'
const { fail, ok } = ipcResult
import type { KanbanTask, TaskUpdateInput } from "@shared/types/ipc"
import type { TaskRepoPort } from '../../../ports'

type Difficulty = 'easy' | 'medium' | 'hard' | 'epic'

export class UpdateTaskUseCase {
  constructor(
    private readonly taskRepo: TaskRepoPort,
    private readonly modelResolver: (difficulty: Difficulty) => string | null,
    private readonly emitTaskUpdated: (taskId: string) => void
  ) {}

  execute(input: TaskUpdateInput): Result<{ task: KanbanTask }> {
    const finalPatch = { ...input.patch }
    if (typeof finalPatch.difficulty === 'string') {
      const model = this.modelResolver(finalPatch.difficulty)
      if (model) {
        finalPatch.modelName = model
      }
    }

    const updateResult = this.taskRepo.update(input.taskId, finalPatch)
    if (updateResult.ok === false) {
      return updateResult
    }

    const taskResult = this.taskRepo.getById(input.taskId)
    if (taskResult.ok === false) {
      return taskResult
    }

    if (!taskResult.data) {
      return fail(ErrorCode.TASK_NOT_FOUND, 'Task not found')
    }

    this.emitTaskUpdated(input.taskId)
    return ok({ task: taskResult.data })
  }
}
