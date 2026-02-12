import { ok, fail, Result, unwrap } from '../../../../../shared/dist/ipc/result'
import type { Result } from '../../../../../shared/dist/ipc/result'
export class CancelRunUseCase {
  constructor(private readonly cancelRun: (runId: string) => Promise<void>) {}

  async execute(runId: string): Promise<Result<{ ok: true }>> {
    await this.cancelRun(runId)
    return ok({ ok: true })
  }
}
