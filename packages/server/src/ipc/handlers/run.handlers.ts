import { ipcHandlers } from '../validation'
import * as ipcErrors from '@shared/ipc/errors'
const { ErrorCode } = ipcErrors
import * as ipcResult from '@shared/ipc/result'
const { fail, ok } = ipcResult
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
} from "@shared/types/ipc"
import type { AppContext } from '../composition/create-app-context'

export function registerRunHandlers(context: AppContext): void {
  const {
    startRunUseCase,
    cancelRunUseCase,
    deleteRunUseCase,
    listRunsByTaskUseCase,
    getRunUseCase,
    listRunEvents,
    listArtifactsByRun,
    getArtifactById,
    getAnalyticsOverview,
    getAnalyticsRunStats,
  } = context

  ipcHandlers.register('run:start', RunStartInputSchema, async (_, input) => {
    const result = startRunUseCase.execute(input)
    if (!result.ok) {
      return result
    }
    return ok(RunStartResponseSchema.parse(result.data))
  })

  ipcHandlers.register('run:cancel', RunCancelInputSchema, async (_, { runId }) => {
    const result = await cancelRunUseCase.execute(runId)
    if (!result.ok) {
      return result
    }
    return ok(RunCancelResponseSchema.parse(result.data))
  })

  ipcHandlers.register('run:delete', RunDeleteInputSchema, async (_, { runId }) => {
    const result = deleteRunUseCase.execute(runId)
    if (!result.ok) {
      return result
    }
    return ok(RunDeleteResponseSchema.parse(result.data))
  })

  ipcHandlers.register('run:listByTask', RunListByTaskInputSchema, async (_, { taskId }) => {
    const result = listRunsByTaskUseCase.execute(taskId)
    if (!result.ok) {
      return result
    }
    return ok(RunListByTaskResponseSchema.parse(result.data))
  })

  ipcHandlers.register('run:get', RunGetInputSchema, async (_, { runId }) => {
    const result = getRunUseCase.execute(runId)
    if (!result.ok) {
      return result
    }
    return ok(RunGetResponseSchema.parse(result.data))
  })

  ipcHandlers.register('run:events:tail', RunEventsTailInputSchema, async (_, input) => {
    const events = listRunEvents(input.runId, input.afterTs, input.limit)
    return RunEventsTailResponseSchema.parse({ events })
  })

  ipcHandlers.register('artifact:list', ArtifactListInputSchema, async (_, { runId }) => {
    const artifacts = listArtifactsByRun(runId)
    return ArtifactListResponseSchema.parse({ artifacts })
  })

  ipcHandlers.register('artifact:get', ArtifactGetInputSchema, async (_, { artifactId }) => {
    const artifact = getArtifactById(artifactId)
    if (!artifact) {
      return fail(ErrorCode.NOT_FOUND, 'Artifact not found', { artifactId })
    }
    return ok(ArtifactGetResponseSchema.parse({ artifact }))
  })

  ipcHandlers.register(
    'analytics:getOverview',
    AnalyticsGetOverviewInputSchema,
    async (_, input) => {
      const overview = getAnalyticsOverview(input.projectId, input.range)
      return AnalyticsGetOverviewResponseSchema.parse({ overview })
    }
  )

  ipcHandlers.register(
    'analytics:getRunStats',
    AnalyticsGetRunStatsInputSchema,
    async (_, input) => {
      const stats = getAnalyticsRunStats(input.projectId, input.range)
      return AnalyticsGetRunStatsResponseSchema.parse({ stats })
    }
  )
}
