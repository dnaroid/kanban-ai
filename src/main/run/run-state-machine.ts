import { runRepo } from '../db/run-repository.js'
import type { RunStatus } from '../db/run-types'
import { RunEventWriter } from './run-event-writer.js'

export class RunStateMachine {
  constructor(private readonly eventWriter: RunEventWriter = new RunEventWriter()) {}

  markRunning(runId: string): void {
    const now = new Date().toISOString()
    runRepo.update(runId, { status: 'running', startedAt: now, errorText: '' })
    this.emitStatus(runId, 'running')
  }

  markSucceeded(runId: string): void {
    const now = new Date().toISOString()
    runRepo.update(runId, { status: 'succeeded', finishedAt: now, errorText: '' })
    this.emitStatus(runId, 'succeeded')
  }

  markFailed(runId: string, errorText: string): void {
    const now = new Date().toISOString()
    runRepo.update(runId, { status: 'failed', finishedAt: now, errorText })
    this.emitStatus(runId, 'failed', { errorText })
  }

  markCanceled(runId: string): void {
    const latest = runRepo.getById(runId)
    if (!latest || latest.status === 'canceled') return

    const now = new Date().toISOString()
    runRepo.update(runId, { status: 'canceled', finishedAt: now })
    this.emitStatus(runId, 'canceled')
  }

  private emitStatus(
    runId: string,
    status: RunStatus,
    payload: Record<string, unknown> = {}
  ): void {
    this.eventWriter.emitStatus(runId, status, payload)
  }
}
