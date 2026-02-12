import { ErrorCode, fail, ok, type Result } from "../../shared/src/ipc'
import type { Run } from "@shared/types/ipc"
import type { RunRepoPort } from '../../../ports'

export class GetRunUseCase {
  constructor(private readonly runRepo: RunRepoPort) {}

  execute(runId: string): Result<{ run: Run }> {
    const runResult = this.runRepo.getById(runId)
    if (runResult.ok === false) {
      return runResult
    }

    if (!runResult.data) {
      return fail(ErrorCode.RUN_NOT_FOUND, 'Run not found')
    }

    return ok({ run: runResult.data })
  }
}
