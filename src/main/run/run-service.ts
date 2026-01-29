import { runRepo } from '../db/run-repository.js'
import { JobRunner } from './job-runner.js'
import { OpenCodeExecutor } from './opencode-executor.js'

const executor = new OpenCodeExecutor()
const jobRunner = new JobRunner(executor, {
  concurrency: Number(process.env.RUN_CONCURRENCY ?? 1),
})

const queuedRunIds = runRepo.listByStatus('queued', 500).map((run) => run.id)
jobRunner.init(queuedRunIds)

export const runService = {
  enqueue(runId: string) {
    jobRunner.enqueue(runId)
  },
  cancel(runId: string) {
    return jobRunner.cancel(runId)
  },
}
