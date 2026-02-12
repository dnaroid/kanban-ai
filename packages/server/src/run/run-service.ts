import { OpenCodeExecutorSDK } from './opencode-executor-sdk.js'
import type { OpenCodePort } from '../ports'
import { QueueManager } from './queue-manager.js'

export const opencodeExecutor: OpenCodePort = new OpenCodeExecutorSDK()
const queueManager = new QueueManager(
  opencodeExecutor,
  process.env.RUN_PROVIDER_CONCURRENCY,
  Number(process.env.RUN_CONCURRENCY ?? 1)
)

export const runService = {
  enqueue(runId: string) {
    queueManager.enqueue(runId)
  },
  cancel(runId: string) {
    return queueManager.cancel(runId)
  },
}
