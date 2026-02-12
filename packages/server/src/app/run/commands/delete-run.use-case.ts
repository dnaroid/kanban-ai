import { ok, fail, Result, unwrap } from '../../../../../shared/dist/ipc/result'
import type { Result } from '../../../../../shared/dist/ipc/result'
import type { RunRepoPort } from '../../../ports'

export class DeleteRunUseCase {
  constructor(private readonly runRepo: RunRepoPort) {}

  execute(runId: string): Result<{ ok: true }> {
    const deleteResult = this.runRepo.delete(runId)
    if (deleteResult.ok === false) {
      return deleteResult
    }

    return ok({ ok: true })
  }
}
