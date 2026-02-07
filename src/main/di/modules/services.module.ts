import { app } from 'electron'
import { createOpencodeClient } from '@opencode-ai/sdk/v2/client'
import { analyticsService } from '../../analytics/analytics-service'
import { agentRoleRepo } from '../../db/agent-role-repository'
import { appSettingsRepo } from '../../db/app-settings-repository'
import { artifactRepo } from '../../db/artifact-repository'
import { boardRepo } from '../../db/board-repository'
import { opencodeModelRepo } from '../../db/opencode-model-repository'
import { runEventRepo } from '../../db/run-event-repository'
import { tagRepo } from '../../db/tag-repository'
import { taskRepo } from '../../db/task-repository'
import { taskScheduleRepo } from '../../db/task-schedule-repository'
import { runService } from '../../run/run-service'

export function createServicesModule() {
  return {
    enqueueRun: (runId: string) => runService.enqueue(runId),
    cancelRun: (runId: string) => runService.cancel(runId),
    getDefaultBoard: (projectId: string) => boardRepo.getDefault(projectId),
    updateBoardColumns: (boardId: string, columns: Parameters<typeof boardRepo.updateColumns>[1]) =>
      boardRepo.updateColumns(boardId, columns),
    getBoardColumns: (boardId: string) => boardRepo.getColumns(boardId),
    createTag: (input: Parameters<typeof tagRepo.create>[0]) => tagRepo.create(input),
    updateTag: (id: string, input: Parameters<typeof tagRepo.update>[1]) =>
      tagRepo.update(id, input),
    deleteTag: (id: string) => tagRepo.delete(id),
    listTags: () => tagRepo.listAll(),
    listScheduleByProject: (projectId: string) => taskScheduleRepo.listByProject(projectId),
    updateSchedule: (input: Parameters<typeof taskScheduleRepo.update>[0]) =>
      taskScheduleRepo.update(input),
    listAgentRoles: () => agentRoleRepo.list(),
    getTaskByIdRaw: (taskId: string) => taskRepo.getById(taskId),
    listAllModels: () => opencodeModelRepo.getAll(),
    listEnabledModels: () => opencodeModelRepo.getEnabled(),
    syncSdkModels: (models: Array<{ name: string; variants: string[] }>) =>
      opencodeModelRepo.syncFromSdkModels(models),
    updateModelEnabled: (name: string, enabled: boolean) =>
      opencodeModelRepo.updateEnabled(name, enabled),
    updateModelDifficulty: (
      name: string,
      difficulty: Parameters<typeof opencodeModelRepo.updateDifficulty>[1]
    ) => opencodeModelRepo.updateDifficulty(name, difficulty),
    getLastProjectId: () => appSettingsRepo.getLastProjectId(),
    setLastProjectId: (projectId: string | null) => {
      if (projectId === null) {
        appSettingsRepo.clearLastProjectId()
      } else {
        appSettingsRepo.setLastProjectId(projectId)
      }
    },
    getSidebarCollapsed: () => appSettingsRepo.getSidebarCollapsed(),
    setSidebarCollapsed: (collapsed: boolean) => appSettingsRepo.setSidebarCollapsed(collapsed),
    getDefaultModel: (difficulty: Parameters<typeof appSettingsRepo.getDefaultModel>[0]) =>
      appSettingsRepo.getDefaultModel(difficulty),
    setDefaultModel: (
      difficulty: Parameters<typeof appSettingsRepo.setDefaultModel>[0],
      modelName: string
    ) => appSettingsRepo.setDefaultModel(difficulty, modelName),
    getOhMyOpencodePath: () => appSettingsRepo.getOhMyOpencodeConfigPath(),
    setOhMyOpencodePath: (path: string) => appSettingsRepo.setOhMyOpencodeConfigPath(path),
    getRetentionEnabled: () => appSettingsRepo.getRetentionEnabled(),
    setRetentionEnabled: (enabled: boolean) => appSettingsRepo.setRetentionEnabled(enabled),
    getRetentionDays: () => appSettingsRepo.getRetentionDays(),
    setRetentionDays: (days: number) => appSettingsRepo.setRetentionDays(days),
    listRunEvents: (runId: string, afterTs?: string, limit?: number) =>
      runEventRepo.listByRun(runId, { afterTs, limit }),
    listArtifactsByRun: (runId: string) => artifactRepo.listByRun(runId),
    getArtifactById: (artifactId: string) => artifactRepo.getById(artifactId),
    getAnalyticsOverview: (projectId?: string, range?: { from?: string; to?: string }) =>
      analyticsService.getOverview(projectId ?? '', range),
    getAnalyticsRunStats: (projectId?: string, range?: { from?: string; to?: string }) =>
      analyticsService.getRunStats(projectId ?? '', range),
    createOpencodeClientInstance: (projectPath?: string) => {
      const baseUrl = process.env.OPENCODE_URL || 'http://127.0.0.1:4096'
      return createOpencodeClient({
        baseUrl,
        throwOnError: true,
        directory: projectPath ?? app.getPath('userData'),
      })
    },
  }
}

export type ServicesModule = ReturnType<typeof createServicesModule>
