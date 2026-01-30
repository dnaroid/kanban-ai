import { app, dialog } from 'electron'
import path from 'path'
import { ipcHandlers } from './validation'
import { z } from 'zod'
import { registerDiagnosticsHandlers } from './diagnostics-handlers'
import { sessionManager } from '../run/opencode-session-manager'
import type { SessionEvent } from '../run/opencode-session-manager'
import {
  AppInfoSchema,
  CreateProjectInputSchema,
  UpdateProjectInputSchema,
  DeleteProjectInputSchema,
  CreateTaskInputSchema,
  BoardGetDefaultInputSchema,
  BoardGetDefaultResponseSchema,
  BoardUpdateColumnsInputSchema,
  BoardUpdateColumnsResponseSchema,
  TaskListByBoardInputSchema,
  TaskListByBoardResponseSchema,
  TaskCreateResponseSchema,
  TaskUpdateInputSchema,
  TaskUpdateResponseSchema,
  TaskMoveInputSchema,
  TaskMoveResponseSchema,
  TaskDeleteInputSchema,
  TaskDeleteResponseSchema,
  DepsListInputSchema,
  DepsListResponseSchema,
  DepsAddInputSchema,
  DepsAddResponseSchema,
  DepsRemoveInputSchema,
  DepsRemoveResponseSchema,
  ScheduleGetInputSchema,
  ScheduleGetResponseSchema,
  ScheduleUpdateInputSchema,
  ScheduleUpdateResponseSchema,
  SearchQueryInputSchema,
  SearchQueryResponseSchema,
  AnalyticsGetOverviewInputSchema,
  AnalyticsGetOverviewResponseSchema,
  AnalyticsGetRunStatsInputSchema,
  AnalyticsGetRunStatsResponseSchema,
  PluginsListResponseSchema,
  PluginsInstallInputSchema,
  PluginsInstallResponseSchema,
  PluginsEnableInputSchema,
  PluginsEnableResponseSchema,
  PluginsReloadResponseSchema,
  RolesListResponseSchema,
  BackupExportInputSchema,
  BackupExportResponseSchema,
  BackupImportInputSchema,
  BackupImportResponseSchema,
  RunStartInputSchema,
  RunStartResponseSchema,
  RunCancelInputSchema,
  RunCancelResponseSchema,
  RunListByTaskInputSchema,
  RunListByTaskResponseSchema,
  RunGetInputSchema,
  RunGetResponseSchema,
  RunEventsTailInputSchema,
  RunEventsTailResponseSchema,
  ArtifactListInputSchema,
  ArtifactListResponseSchema,
  ArtifactGetInputSchema,
  ArtifactGetResponseSchema,
  AppSettingGetLastProjectIdResponseSchema,
  AppSettingSetLastProjectIdInputSchema,
  AppSettingSetLastProjectIdResponseSchema,
} from '../../shared/types/ipc.js'
import { projectRepo } from '../db/project-repository'
import { appSettingsRepo } from '../db/app-settings-repository.js'
import { boardRepo } from '../db/board-repository'
import { taskRepo } from '../db/task-repository'
import { dependencyService } from '../deps/dependency-service'
import { taskScheduleRepo } from '../db/task-schedule-repository'
import { searchService } from '../search/search-service'
import { analyticsService } from '../analytics/analytics-service'
import { pluginService } from '../plugins/plugin-service'
import { agentRoleRepo } from '../db/agent-role-repository'
import { backupService } from '../backup/backup-service'
import { runRepo } from '../db/run-repository'
import { runEventRepo } from '../db/run-event-repository'
import { artifactRepo } from '../db/artifact-repository'
import { runService } from '../run/run-service'
import { buildContextSnapshot } from '../run/context-snapshot-builder'

ipcHandlers.register('project:selectFolder', z.unknown(), async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openDirectory', 'createDirectory'],
    title: 'Select Project Folder',
  })

  if (result.canceled || result.filePaths.length === 0) {
    return null
  }

  const selectedPath = result.filePaths[0]
  const projectName = path.basename(selectedPath)

  return {
    path: selectedPath,
    name: projectName,
  }
})

ipcHandlers.register('app:getInfo', z.unknown(), async () => {
  return AppInfoSchema.parse({
    name: app.getName(),
    version: app.getVersion(),
    platform: process.platform,
    arch: process.arch,
    electronVersion: process.versions.electron,
    chromeVersion: process.versions.chrome,
    nodeVersion: process.versions.node,
    mode: app.isPackaged ? 'production' : 'development',
    userDataPath: app.getPath('userData'),
  })
})

ipcHandlers.register('project:create', CreateProjectInputSchema, async (_, input) => {
  console.log('[IPC] Creating project:', input)
  const project = projectRepo.create(input)
  console.log('[IPC] Project created:', project)
  return project
})

ipcHandlers.register('project:getAll', z.unknown(), async () => {
  const projects = projectRepo.getAll()
  console.log('[IPC] Returning projects:', projects)
  return projects
})

ipcHandlers.register('project:getById', z.string(), async (_, id) => {
  return projectRepo.getById(id)
})

ipcHandlers.register('project:update', UpdateProjectInputSchema, async (_, input) => {
  const { id, ...updates } = input
  return projectRepo.update(id, updates)
})

ipcHandlers.register('project:delete', DeleteProjectInputSchema, async (_, input) => {
  return projectRepo.delete(input.id)
})

ipcHandlers.register('board:getDefault', BoardGetDefaultInputSchema, async (_, { projectId }) => {
  const { columns = [], ...board } = boardRepo.getDefault(projectId)
  return BoardGetDefaultResponseSchema.parse({ board, columns })
})

ipcHandlers.register(
  'board:updateColumns',
  BoardUpdateColumnsInputSchema,
  async (_, { boardId, columns }) => {
    boardRepo.updateColumns(boardId, columns)
    const updatedColumns = boardRepo.getColumns(boardId)
    return BoardUpdateColumnsResponseSchema.parse({ columns: updatedColumns })
  }
)

ipcHandlers.register('task:create', CreateTaskInputSchema, async (_, input) => {
  const task = taskRepo.create(input)
  return TaskCreateResponseSchema.parse({ task })
})

ipcHandlers.register('task:listByBoard', TaskListByBoardInputSchema, async (_, { boardId }) => {
  const tasks = taskRepo.listByBoard(boardId)
  return TaskListByBoardResponseSchema.parse({ tasks })
})

ipcHandlers.register('task:update', TaskUpdateInputSchema, async (_, { taskId, patch }) => {
  taskRepo.update(taskId, patch)
  const task = taskRepo.getById(taskId)
  if (!task) {
    throw new Error('Task not found')
  }
  return TaskUpdateResponseSchema.parse({ task })
})

ipcHandlers.register(
  'task:move',
  TaskMoveInputSchema,
  async (_, { taskId, toColumnId, toIndex }) => {
    taskRepo.move(taskId, toColumnId, toIndex)
    return TaskMoveResponseSchema.parse({ success: true })
  }
)

ipcHandlers.register('task:delete', TaskDeleteInputSchema, async (_, { taskId }) => {
  taskRepo.delete(taskId)
  return TaskDeleteResponseSchema.parse({ ok: true })
})

ipcHandlers.register('deps:list', DepsListInputSchema, async (_, { taskId }) => {
  const links = dependencyService.list(taskId)
  return DepsListResponseSchema.parse({ links })
})

ipcHandlers.register('deps:add', DepsAddInputSchema, async (_, input) => {
  const link = dependencyService.add({
    fromTaskId: input.fromTaskId,
    toTaskId: input.toTaskId,
    type: input.type,
  })
  return DepsAddResponseSchema.parse({ link })
})

ipcHandlers.register('deps:remove', DepsRemoveInputSchema, async (_, { linkId }) => {
  dependencyService.remove(linkId)
  return DepsRemoveResponseSchema.parse({ ok: true })
})

ipcHandlers.register('schedule:get', ScheduleGetInputSchema, async (_, { projectId }) => {
  const tasks = taskScheduleRepo.listByProject(projectId)
  return ScheduleGetResponseSchema.parse({ tasks })
})

ipcHandlers.register('schedule:update', ScheduleUpdateInputSchema, async (_, input) => {
  const schedule = taskScheduleRepo.update(input)
  return ScheduleUpdateResponseSchema.parse({ schedule })
})

ipcHandlers.register('search:query', SearchQueryInputSchema, async (_, input) => {
  const filters = input.filters
  const results: Array<unknown> = []

  if (!filters?.entity || filters.entity === 'task') {
    const tasks = searchService.queryTasks(input.q, filters)
    results.push(...tasks.map((task) => ({ entity: 'task', task })))
  }

  if (!filters?.entity || filters.entity === 'run') {
    const runs = searchService.queryRuns(input.q, filters)
    results.push(...runs.map((run) => ({ entity: 'run', run })))
  }

  if (!filters?.entity || filters.entity === 'artifact') {
    const artifacts = searchService.queryArtifacts(input.q, filters)
    results.push(...artifacts.map((artifact) => ({ entity: 'artifact', artifact })))
  }

  return SearchQueryResponseSchema.parse({ results })
})

ipcHandlers.register('analytics:getOverview', AnalyticsGetOverviewInputSchema, async (_, input) => {
  const overview = analyticsService.getOverview(input.projectId, input.range)
  return AnalyticsGetOverviewResponseSchema.parse({ overview })
})

ipcHandlers.register('analytics:getRunStats', AnalyticsGetRunStatsInputSchema, async (_, input) => {
  const stats = analyticsService.getRunStats(input.projectId, input.range)
  return AnalyticsGetRunStatsResponseSchema.parse({ stats })
})

ipcHandlers.register('plugins:list', null, async () => {
  const plugins = pluginService.list()
  return PluginsListResponseSchema.parse({ plugins })
})

ipcHandlers.register('plugins:install', PluginsInstallInputSchema, async (_, input) => {
  const plugin = pluginService.install(input.path)
  return PluginsInstallResponseSchema.parse({ plugin })
})

ipcHandlers.register('plugins:enable', PluginsEnableInputSchema, async (_, input) => {
  const plugin = pluginService.enable(input.pluginId, input.enabled)
  return PluginsEnableResponseSchema.parse({ plugin })
})

ipcHandlers.register('plugins:reload', null, async () => {
  const plugins = pluginService.reload()
  return PluginsReloadResponseSchema.parse({ plugins })
})

ipcHandlers.register('roles:list', null, async () => {
  const roles = agentRoleRepo.list()
  return RolesListResponseSchema.parse({ roles })
})

ipcHandlers.register('backup:exportProject', BackupExportInputSchema, async (_, input) => {
  const result = backupService.exportProject({
    projectId: input.projectId,
    toPath: input.toPath,
  })
  return BackupExportResponseSchema.parse(result)
})

ipcHandlers.register('backup:importProject', BackupImportInputSchema, async (_, input) => {
  const result = backupService.importProject({
    zipPath: input.zipPath,
    mode: input.mode,
    projectPath: input.projectPath,
  })
  return BackupImportResponseSchema.parse(result)
})

ipcHandlers.register('run:start', RunStartInputSchema, async (_, input) => {
  const snapshot = buildContextSnapshot({
    taskId: input.taskId,
    roleId: input.roleId,
    mode: input.mode,
  })
  const run = runRepo.create({
    taskId: input.taskId,
    roleId: input.roleId,
    mode: input.mode,
    contextSnapshotId: snapshot.id,
  })
  runService.enqueue(run.id)
  return RunStartResponseSchema.parse({ runId: run.id })
})

ipcHandlers.register('run:cancel', RunCancelInputSchema, async (_, { runId }) => {
  await runService.cancel(runId)
  return RunCancelResponseSchema.parse({ ok: true })
})

ipcHandlers.register('run:listByTask', RunListByTaskInputSchema, async (_, { taskId }) => {
  const runs = runRepo.listByTask(taskId)
  return RunListByTaskResponseSchema.parse({ runs })
})

ipcHandlers.register('run:get', RunGetInputSchema, async (_, { runId }) => {
  const run = runRepo.getById(runId)
  if (!run) {
    throw new Error('Run not found')
  }
  return RunGetResponseSchema.parse({ run })
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
    throw new Error('Artifact not found')
  }
  return ArtifactGetResponseSchema.parse({ artifact })
})

ipcHandlers.register('appSetting:getLastProjectId', z.unknown(), async () => {
  const projectId = appSettingsRepo.getLastProjectId()
  return AppSettingGetLastProjectIdResponseSchema.parse({ projectId })
})

ipcHandlers.register(
  'appSetting:setLastProjectId',
  AppSettingSetLastProjectIdInputSchema,
  async (_, input) => {
    appSettingsRepo.setLastProjectId(input.projectId)
    return AppSettingSetLastProjectIdResponseSchema.parse({ ok: true })
  }
)

ipcHandlers.register(
  'opencode:subscribeToEvents',
  z.object({ sessionID: z.string() }),
  async (event, input) => {
    const { sessionID } = input
    const webContents = event.sender

    await sessionManager.subscribeToSessionEvents(sessionID, (sessionEvent: SessionEvent) => {
      webContents.send('opencode:event', sessionEvent)
    })

    return { ok: true, subscribed: true }
  }
)

ipcHandlers.register(
  'opencode:unsubscribeFromEvents',
  z.object({ sessionID: z.string() }),
  async (_, input) => {
    const { sessionID } = input
    await sessionManager.unsubscribeFromSessionEvents(sessionID)
    return { ok: true, subscribed: false }
  }
)

ipcHandlers.register(
  'opencode:isSubscribed',
  z.object({ sessionID: z.string() }),
  async (_, input) => {
    const { sessionID } = input
    const subscribed = sessionManager.isSubscribedToSessionEvents(sessionID)
    return { ok: true, subscribed }
  }
)

registerDiagnosticsHandlers()

console.log('[IPC] Handlers registered')
