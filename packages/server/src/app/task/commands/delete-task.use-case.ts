import { ok, fail, Result, unwrap } from '../../../../../shared/dist/ipc/result'
import type { Result } from '../../../../../shared/dist/ipc/result'
import type { TaskDeleteInput } from '../../../../../shared/dist/types/ipc'
import type { TaskRepoPort } from '../../../ports'

export class DeleteTaskUseCase {
  constructor(private readonly taskRepo: TaskRepoPort) {}

  execute(input: TaskDeleteInput): Result<{ ok: true }> {
    const deleteResult = this.taskRepo.delete(input.taskId)
    if (deleteResult.ok === false) {
      return deleteResult
    }

    return ok({ ok: true })
  }
}
