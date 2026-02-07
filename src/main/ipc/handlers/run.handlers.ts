import { ipcHandlers } from '../validation'
import { ErrorCode } from '../../../shared/ipc'
import {
  AnalyticsGetOverviewInputSchema,
  AnalyticsGetOverviewResponseSchema,
  AnalyticsGetRunStatsInputSchema,
  AnalyticsGetRunStatsResponseSchema,
  ArtifactGetInputSchema,
  ArtifactGetResponseSchema,
  ArtifactListInputSchema,
  ArtifactListResponseSchema,
  RunCancelInputSchema,
  RunCancelResponseSchema,
  RunDeleteInputSchema,
  RunDeleteResponseSchema,
  RunEventsTailInputSchema,
  RunEventsTailResponseSchema,
  RunGetInputSchema,
  RunGetResponseSchema,
  RunListByTaskInputSchema,
  RunListByTaskResponseSchema,
  RunStartInputSchema,
  RunStartResponseSchema,
} from '../../../shared/types/ipc.js'
import { unwrap } from '../../../shared/ipc'
import type { AppContext } from '../composition/create-app-context'
import { ipcError } from '../ipc-domain-error'
import { runEventRepo } from '../../db/run-event-repository'
import { artifactRepo } from '../../db/artifact-repository'
import { analyticsService } from '../../analytics/analytics-service'

export function registerRunHandlers(context: AppContext): void {
  const {
    startRunUseCase,
    cancelRunUseCase,
    deleteRunUseCase,
    listRunsByTaskUseCase,
    getRunUseCase,
  } = context

  ipcHandlers.register('run:start', RunStartInputSchema, async (_, input) => {
    return RunStartResponseSchema.parse(unwrap(startRunUseCase.execute(input)))
  })

  ipcHandlers.register('run:cancel', RunCancelInputSchema, async (_, { runId }) => {
    return RunCancelResponseSchema.parse(unwrap(await cancelRunUseCase.execute(runId)))
  })

  ipcHandlers.register('run:delete', RunDeleteInputSchema, async (_, { runId }) => {
    return RunDeleteResponseSchema.parse(unwrap(deleteRunUseCase.execute(runId)))
  })

  ipcHandlers.register('run:listByTask', RunListByTaskInputSchema, async (_, { taskId }) => {
    return RunListByTaskResponseSchema.parse(unwrap(listRunsByTaskUseCase.execute(taskId)))
  })

  ipcHandlers.register('run:get', RunGetInputSchema, async (_, { runId }) => {
    return RunGetResponseSchema.parse(unwrap(getRunUseCase.execute(runId)))
  })

  ipcHandlers.register('run:events:tail', RunEventsTailInputSchema, async (_, input) => {
    const events = runEventRepo.listByRun(input.runId, {
      afterTs: input.afterTs,
      limit: input.limit,
    })
    return RunEventsTailResponseSchema.parse({ events })
  })

  ipcHandlers.register('artifact:list', ArtifactListInputSchema, async (_, { runId }) => {
    const artifacts = artifactRepo.listByRun(runId)
    return ArtifactListResponseSchema.parse({ artifacts })
  })

  ipcHandlers.register('artifact:get', ArtifactGetInputSchema, async (_, { artifactId }) => {
    const artifact = artifactRepo.getById(artifactId)
    if (!artifact) {
      throw ipcError(ErrorCode.NOT_FOUND, 'Artifact not found', { artifactId })
    }
    return ArtifactGetResponseSchema.parse({ artifact })
  })

  ipcHandlers.register(
    'analytics:getOverview',
    AnalyticsGetOverviewInputSchema,
    async (_, input) => {
      const overview = analyticsService.getOverview(input.projectId, input.range)
      return AnalyticsGetOverviewResponseSchema.parse({ overview })
    }
  )

  ipcHandlers.register(
    'analytics:getRunStats',
    AnalyticsGetRunStatsInputSchema,
    async (_, input) => {
      const stats = analyticsService.getRunStats(input.projectId, input.range)
      return AnalyticsGetRunStatsResponseSchema.parse({ stats })
    }
  )
}
