import { createRepositoriesModule } from './modules/repositories.module'
import { createServicesModule } from './modules/services.module'
import { createUseCasesModule } from './modules/usecases.module'
import { agentRoleRepo } from '../db/agent-role-repository'
import { appSettingsRepo } from '../db/app-settings-repository'
import { artifactRepo } from '../db/artifact-repository'
import { boardRepo } from '../db/board-repository'
import { opencodeModelRepo } from '../db/opencode-model-repository'
import { runEventRepo } from '../db/run-event-repository'
import { tagRepo } from '../db/tag-repository'
import { taskRepo } from '../db/task-repository'
import { taskScheduleRepo } from '../db/task-schedule-repository'

export function createAppContainer() {
  const repositories = createRepositoriesModule()
  const services = createServicesModule({
    agentRoleRepo,
    appSettingsRepo,
    artifactRepo,
    boardRepo,
    opencodeModelRepo,
    runEventRepo,
    tagRepo,
    taskRepo,
    taskScheduleRepo,
  })
  const useCases = createUseCasesModule(repositories, services)

  return {
    projectRepoAdapter: repositories.projectRepoAdapter,
    taskRepoAdapter: repositories.taskRepoAdapter,
    runRepoAdapter: repositories.runRepoAdapter,
    listRunEvents: services.listRunEvents,
    listArtifactsByRun: services.listArtifactsByRun,
    getArtifactById: services.getArtifactById,
    getAnalyticsOverview: services.getAnalyticsOverview,
    getAnalyticsRunStats: services.getAnalyticsRunStats,
    getDefaultBoard: services.getDefaultBoard,
    updateBoardColumns: services.updateBoardColumns,
    getBoardColumns: services.getBoardColumns,
    createTag: services.createTag,
    updateTag: services.updateTag,
    deleteTag: services.deleteTag,
    listTags: services.listTags,
    listScheduleByProject: services.listScheduleByProject,
    updateSchedule: services.updateSchedule,
    listAgentRoles: services.listAgentRoles,
    getTaskByIdRaw: services.getTaskByIdRaw,
    listAllModels: services.listAllModels,
    listEnabledModels: services.listEnabledModels,
    syncSdkModels: services.syncSdkModels,
    updateModelEnabled: services.updateModelEnabled,
    updateModelDifficulty: services.updateModelDifficulty,
    getLastProjectId: services.getLastProjectId,
    setLastProjectId: services.setLastProjectId,
    getSidebarCollapsed: services.getSidebarCollapsed,
    setSidebarCollapsed: services.setSidebarCollapsed,
    getDefaultModel: services.getDefaultModel,
    setDefaultModel: services.setDefaultModel,
    getOhMyOpencodePath: services.getOhMyOpencodePath,
    setOhMyOpencodePath: services.setOhMyOpencodePath,
    getRetentionEnabled: services.getRetentionEnabled,
    setRetentionEnabled: services.setRetentionEnabled,
    getRetentionDays: services.getRetentionDays,
    setRetentionDays: services.setRetentionDays,
    ...useCases,
    createOpencodeClientInstance: services.createOpencodeClientInstance,
  }
}

export type AppContainer = ReturnType<typeof createAppContainer>
