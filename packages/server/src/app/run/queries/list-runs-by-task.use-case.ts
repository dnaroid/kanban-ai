import { ok, fail, Result, unwrap } from '../../../../../shared/dist/ipc/result'
import type { Result } from '../../../../../shared/dist/ipc/result'
import type { Run } from '../../../../../shared/dist/types/ipc'
import type { RunRepoPort } from '../../../ports'

export class ListRunsByTaskUseCase {
  constructor(private readonly runRepo: RunRepoPort) {}

  execute(taskId: string): Result<{ runs: Run[] }> {
    const runsResult = this.runRepo.listByTask(taskId)
    if (runsResult.ok === false) {
      return runsResult
    }

    return ok({ runs: runsResult.data })
  }
}
