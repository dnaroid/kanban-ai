import { ok, type Result } from "../../shared/src/ipc'
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
