import { app } from 'electron'
import { createOpencodeClient } from '@opencode-ai/sdk/v2/client'
import { runService } from '../../run/run-service'
import type { AgentRoleRepository } from '../../db/agent-role-repository'
import type { AppSettingsRepository } from '../../db/app-settings-repository'
import type { ArtifactRepository } from '../../db/artifact-repository'
import type { BoardRepository } from '../../db/board-repository'
import type { OpencodeModelRepository } from '../../db/opencode-model-repository'
import type { RunEventRepository } from '../../db/run-event-repository'
import type { TagRepository } from '../../db/tag-repository'
import type { TaskRepository } from '../../db/task-repository'
import type { TaskScheduleRepository } from '../../db/task-schedule-repository'

interface ServicesModuleDeps {
  agentRoleRepo: AgentRoleRepository
  appSettingsRepo: AppSettingsRepository
  artifactRepo: ArtifactRepository
  boardRepo: BoardRepository
  opencodeModelRepo: OpencodeModelRepository
  runEventRepo: RunEventRepository
  tagRepo: TagRepository
  taskRepo: TaskRepository
  taskScheduleRepo: TaskScheduleRepository
}

export function createServicesModule(deps: ServicesModuleDeps) {
  const {
    agentRoleRepo,
    appSettingsRepo,
    artifactRepo,
    boardRepo,
    opencodeModelRepo,
    runEventRepo,
    tagRepo,
    taskRepo,
    taskScheduleRepo,
  } = deps
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
