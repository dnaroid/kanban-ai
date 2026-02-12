import { ok, type Result } from "../../shared/src/ipc'

export class CancelRunUseCase {
  constructor(private readonly cancelRun: (runId: string) => Promise<void>) {}

  async execute(runId: string): Promise<Result<{ ok: true }>> {
    await this.cancelRun(runId)
    return ok({ ok: true })
  }
}
