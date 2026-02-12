import * as ipcResult from '@shared/ipc/result'
import type { Result } from '@shared/ipc/result'
const { ok } = ipcResult
export class CancelRunUseCase {
  constructor(private readonly cancelRun: (runId: string) => Promise<void>) {}

  async execute(runId: string): Promise<Result<{ ok: true }>> {
    await this.cancelRun(runId)
    return ok({ ok: true })
  }
}
