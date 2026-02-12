import * as ipcResult from '@shared/ipc/result'
import type { Result } from '@shared/ipc/result'
const { ok } = ipcResult
import type { TaskDeleteInput } from "@shared/types/ipc"
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
