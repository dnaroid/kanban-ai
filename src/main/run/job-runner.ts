import { runRepo } from '../db/run-repository.js'
import { runEventRepo } from '../db/run-event-repository.js'
import type { RunRecord, RunStatus } from '../db/run-types'

export type RunStartResult = 'completed' | 'deferred'

export interface RunExecutor {
  start(run: RunRecord): Promise<RunStartResult>
  cancel(runId: string): Promise<void>
}

type JobRunnerOptions = {
  concurrency?: number
}

export class JobRunner {
  private queue: string[] = []
  private running = new Set<string>()
  private isDraining = false
  private concurrency: number

  constructor(
    private executor: RunExecutor,
    options: JobRunnerOptions = {}
  ) {
    this.concurrency = Math.max(1, options.concurrency ?? 1)
  }

  init(queuedRunIds: string[] = []): void {
    if (queuedRunIds.length === 0) {
      void this.drain()
      return
    }
    for (const runId of queuedRunIds) {
      if (!runId) continue
      if (!this.queue.includes(runId)) {
        this.queue.push(runId)
      }
    }

    void this.drain()
  }

  enqueue(runId: string): void {
    const run = runRepo.getById(runId)
    if (!run || run.status !== 'queued') return
    if (this.queue.includes(runId) || this.running.has(runId)) return

    this.queue.push(runId)
    void this.drain()
  }

  async cancel(runId: string): Promise<void> {
    const queuedIndex = this.queue.indexOf(runId)
    if (queuedIndex >= 0) {
      this.queue.splice(queuedIndex, 1)
      this.markCanceled(runId)
      return
    }

    const run = runRepo.getById(runId)
    if (!run) return

    if (this.running.has(runId) || run.status === 'running') {
      await this.executor.cancel(runId)
      this.markCanceled(runId)
      return
    }

    if (run.status === 'queued') {
      this.markCanceled(runId)
    }
  }

  private async drain(): Promise<void> {
    if (this.isDraining) return
    this.isDraining = true

    try {
      while (this.running.size < this.concurrency && this.queue.length > 0) {
        const runId = this.queue.shift()
        if (!runId) continue
        if (this.running.has(runId)) continue

        this.running.add(runId)
        void this.execute(runId)
      }
    } finally {
      this.isDraining = false
    }
  }

  private async execute(runId: string): Promise<void> {
    try {
      const run = runRepo.getById(runId)
      if (!run || run.status !== 'queued') return

      this.markRunning(runId)
      const result = await this.executor.start(run)

      const latest = runRepo.getById(runId)
      if (latest?.status === 'canceled') return

      if (result === 'completed') {
        this.markSucceeded(runId)
      }
    } catch (error) {
      const latest = runRepo.getById(runId)
      if (latest?.status === 'canceled') return

      const errorText = error instanceof Error ? error.message : String(error)
      this.markFailed(runId, errorText)
    } finally {
      this.running.delete(runId)
      void this.drain()
    }
  }

  private markRunning(runId: string): void {
    const now = new Date().toISOString()
    runRepo.update(runId, { status: 'running', startedAt: now, errorText: '' })
    this.emitStatus(runId, 'running')
  }

  private markSucceeded(runId: string): void {
    const now = new Date().toISOString()
    runRepo.update(runId, { status: 'succeeded', finishedAt: now, errorText: '' })
    this.emitStatus(runId, 'succeeded')
  }

  private markFailed(runId: string, errorText: string): void {
    const now = new Date().toISOString()
    runRepo.update(runId, { status: 'failed', finishedAt: now, errorText })
    this.emitStatus(runId, 'failed', { errorText })
  }

  private markCanceled(runId: string): void {
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
