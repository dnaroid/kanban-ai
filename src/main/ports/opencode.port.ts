import type { RunRecord } from '../db/run-types'
import type { RunStartResult } from '../run/job-runner'

export interface OpenCodePort {
  start(run: RunRecord): Promise<RunStartResult>
  cancel(runId: string): Promise<void>
  generateUserStory(taskId: string): Promise<string>
}
