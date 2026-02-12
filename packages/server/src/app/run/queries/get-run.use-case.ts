import * as ipcErrors from '../../../../../shared/dist/ipc/errors'
const { ErrorCode } = ipcErrors
import { ok, fail, Result, unwrap } from '../../../../../shared/dist/ipc/result'
import type { Result } from '../../../../../shared/dist/ipc/result'
import type { Run } from '../../../../../shared/dist/types/ipc'
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
