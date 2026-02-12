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

    // Publish to EventBus for SSE (for local-web)
    try {
      const { publishEvent } = require('../events/eventBus')
      publishEvent('run:status', {
        runId,
        status,
        ...payload,
      })
    } catch (error) {
      // EventBus may not be initialized yet, ignore
      console.warn('Failed to publish run status event to EventBus:', error)
    }
  }
}
