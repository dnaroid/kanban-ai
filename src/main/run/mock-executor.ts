import { setTimeout as delay } from 'node:timers/promises'
import { artifactRepo } from '../db/artifact-repository.js'
import { runEventRepo } from '../db/run-event-repository.js'
import type { RunRecord } from '../db/run-types'
import type { RunExecutor } from './job-runner'

type MockExecutorOptions = {
  autoCompleteMs?: number
}

export class MockExecutor implements RunExecutor {
  private pending = new Map<string, () => void>()
  readonly started: string[] = []
  readonly canceled: string[] = []

  constructor(private options: MockExecutorOptions = {}) {}

  async start(run: RunRecord): Promise<void> {
    this.started.push(run.id)

    runEventRepo.create({
      runId: run.id,
      eventType: 'stdout',
      payload: 'mock stdout',
    })
    runEventRepo.create({
      runId: run.id,
      eventType: 'message',
      payload: { text: 'mock message' },
    })

    artifactRepo.create({
      runId: run.id,
      kind: 'markdown',
      title: 'Mock Artifact',
      content: '# Mock Artifact',
    })

    if (this.options.autoCompleteMs !== undefined) {
      await delay(this.options.autoCompleteMs)
      return
    }

    await new Promise<void>((resolve) => {
      this.pending.set(run.id, resolve)
    })
  }

  async cancel(runId: string): Promise<void> {
    this.canceled.push(runId)
    const resolve = this.pending.get(runId)
    if (resolve) {
      this.pending.delete(runId)
      resolve()
    }
  }

  complete(runId: string): void {
    const resolve = this.pending.get(runId)
    if (!resolve) return
    this.pending.delete(runId)
    resolve()
  }
}
