import { runRepo } from '../db/run-repository.js'
import type { RunRecord } from '../db/run-types'
import { RunStateMachine } from './run-state-machine.js'

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
  private readonly stateMachine: RunStateMachine

  constructor(
    private executor: RunExecutor,
    options: JobRunnerOptions = {}
  ) {
    this.concurrency = Math.max(1, options.concurrency ?? 1)
    this.stateMachine = new RunStateMachine()
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
      this.stateMachine.markCanceled(runId)
      return
    }

    const run = runRepo.getById(runId)
    if (!run) return

    if (this.running.has(runId) || run.status === 'running') {
      await this.executor.cancel(runId)
      this.stateMachine.markCanceled(runId)
      return
    }

    if (run.status === 'queued') {
      this.stateMachine.markCanceled(runId)
    }
  }

  getQueueDepth(): number {
    return this.queue.length
  }

  getRunningCount(): number {
    return this.running.size
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

      this.stateMachine.markRunning(runId)
      const result = await this.executor.start(run)

      const latest = runRepo.getById(runId)
      if (latest?.status === 'canceled') return

      if (result === 'completed') {
        this.stateMachine.markSucceeded(runId)
      }
    } catch (error) {
      const latest = runRepo.getById(runId)
      if (latest?.status === 'canceled') return

      const errorText = error instanceof Error ? error.message : String(error)
      this.stateMachine.markFailed(runId, errorText)
    } finally {
      this.running.delete(runId)
      void this.drain()
    }
  }
}
