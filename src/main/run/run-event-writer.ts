import { runEventRepo } from '../db/run-event-repository.js'
import type { RunStatus } from '../db/run-types'

export class RunEventWriter {
  emitStatus(runId: string, status: RunStatus, payload: Record<string, unknown> = {}): void {
    runEventRepo.create({
      runId,
      eventType: 'status',
      payload: {
        status,
        ...payload,
      },
    })
  }
}
