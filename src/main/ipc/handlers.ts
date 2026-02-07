import { app, dialog, shell } from 'electron'
import path from 'path'
import fs from 'fs/promises'
import { parse } from 'jsonc-parser'
import { ipcHandlers } from './validation'
import { z } from 'zod'
import { registerDiagnosticsHandlers } from './diagnostics-handlers'
import type { SessionEvent } from '../run/opencode-session-manager'
import { sessionManager } from '../run/opencode-session-manager'
import { emitTaskEvent, onTaskEvent } from './event-bus-ipc'
import { opencodeSessionWorker } from '../run/opencode-session-worker.js'
import type { OhMyOpencodeModelField, TaskUpdateInput } from '../../shared/types/ipc.js'
import { unwrap } from '../../shared/ipc'
import {
  AnalyticsGetOverviewInputSchema,
  AnalyticsGetOverviewResponseSchema,
  AnalyticsGetRunStatsInputSchema,
  AnalyticsGetRunStatsResponseSchema,
  AppInfoSchema,
  AppSettingGetDefaultModelInputSchema,
  AppSettingGetDefaultModelResponseSchema,
  AppSettingGetLastProjectIdResponseSchema,
  AppSettingGetOhMyOpencodePathResponseSchema,
  AppSettingGetSidebarCollapsedResponseSchema,
  AppSettingSetDefaultModelInputSchema,
  AppSettingSetDefaultModelResponseSchema,
  AppSettingSetLastProjectIdInputSchema,
  AppSettingSetLastProjectIdResponseSchema,
  AppSettingSetOhMyOpencodePathInputSchema,
  AppSettingSetOhMyOpencodePathResponseSchema,
  AppSettingSetSidebarCollapsedInputSchema,
  AppSettingSetSidebarCollapsedResponseSchema,
  ArtifactGetInputSchema,
  ArtifactGetResponseSchema,
  ArtifactListInputSchema,
  ArtifactListResponseSchema,
  BackupExportInputSchema,
  BackupExportResponseSchema,
  BackupImportInputSchema,
  BackupImportResponseSchema,
  BoardGetDefaultInputSchema,
  BoardGetDefaultResponseSchema,
  BoardUpdateColumnsInputSchema,
  BoardUpdateColumnsResponseSchema,
  CreateProjectInputSchema,
  CreateTaskInputSchema,
  DatabaseDeleteInputSchema,
  DatabaseDeleteResponseSchema,
  DeleteProjectInputSchema,
  DepsAddInputSchema,
  DepsAddResponseSchema,
  DepsListInputSchema,
  DepsListResponseSchema,
  DepsRemoveInputSchema,
  DepsRemoveResponseSchema,
  OhMyOpencodeBackupConfigInputSchema,
  OhMyOpencodeBackupConfigResponseSchema,
  OhMyOpencodeListPresetsInputSchema,
  OhMyOpencodeListPresetsResponseSchema,
  OhMyOpencodeReadConfigInputSchema,
  OhMyOpencodeReadConfigResponseSchema,
  OhMyOpencodeSavePresetInputSchema,
  OhMyOpencodeSavePresetResponseSchema,
  OhMyOpencodeRestoreConfigInputSchema,
  OhMyOpencodeRestoreConfigResponseSchema,
  OhMyOpencodeSaveConfigInputSchema,
  OhMyOpencodeSaveConfigResponseSchema,
  OhMyOpencodeLoadPresetInputSchema,
  OhMyOpencodeLoadPresetResponseSchema,
  OpenCodeActiveSessionsResponseSchema,
  OpenCodeGenerateUserStoryInputSchema,
  OpenCodeGenerateUserStoryResponseSchema,
  OpencodeModelsListResponseSchema,
  OpencodeModelToggleInputSchema,
  OpencodeModelToggleResponseSchema,
  OpencodeModelUpdateDifficultyInputSchema,
  OpencodeModelUpdateDifficultyResponseSchema,
  OpencodeSendMessageInputSchema,
  OpencodeSendMessageResponseSchema,
  OpenCodeSessionMessagesInputSchema,
  OpenCodeSessionMessagesResponseSchema,
  OpenCodeSessionStatusInputSchema,
  OpenCodeSessionStatusResponseSchema,
  OpenCodeSessionTodosInputSchema,
  OpenCodeSessionTodosResponseSchema,
  PluginsEnableInputSchema,
  PluginsEnableResponseSchema,
  PluginsInstallInputSchema,
  PluginsInstallResponseSchema,
  PluginsListResponseSchema,
  PluginsReloadResponseSchema,
  RolesListResponseSchema,
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
  ScheduleGetInputSchema,
  ScheduleGetResponseSchema,
  ScheduleUpdateInputSchema,
  ScheduleUpdateResponseSchema,
  SearchQueryInputSchema,
  SearchQueryResponseSchema,
  TagCreateInputSchema,
  TagDeleteInputSchema,
  TagListInputSchema,
  TagListResponseSchema,
  TagUpdateInputSchema,
  TaskCreateResponseSchema,
  TaskDeleteInputSchema,
  TaskDeleteResponseSchema,
  TaskListByBoardInputSchema,
  TaskListByBoardResponseSchema,
  TaskMoveInputSchema,
  TaskMoveResponseSchema,
  TaskUpdateInputSchema,
  TaskUpdateResponseSchema,
  UpdateProjectInputSchema,
  VoskModelDownloadInputSchema,
  VoskModelDownloadResponseSchema,
} from '../../shared/types/ipc.js'
import { appSettingsRepo } from '../db/app-settings-repository.js'
import { boardRepo } from '../db/board-repository'
import { taskRepo } from '../db/task-repository'
import { tagRepo } from '../db/tag-repository'
import { dbManager } from '../db'
import { dependencyService } from '../deps/dependency-service'
import { taskScheduleRepo } from '../db/task-schedule-repository'
import { searchService } from '../search/search-service'
import { opencodeExecutor, runService } from '../run/run-service'
import { analyticsService } from '../analytics/analytics-service'
import { pluginService } from '../plugins/plugin-service'
import { agentRoleRepo } from '../db/agent-role-repository'
import { backupService } from '../backup/backup-service'
import { runEventRepo } from '../db/run-event-repository'
import { artifactRepo } from '../db/artifact-repository'
import { buildContextSnapshot } from '../run/context-snapshot-builder'
import { downloadModelIfNeeded } from '../vosk-model-loader'

const PRESET_SUFFIX = '.oh-my-opencode.json'
const ORIGINAL_PRESET_NAME = `_original${PRESET_SUFFIX}`

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value)

const mergeInPlace = (target: Record<string, unknown>, source: Record<string, unknown>) => {
  for (const key of Object.keys(target)) {
    if (!(key in source)) delete target[key]
  }

  for (const [key, value] of Object.entries(source)) {
    if (value === undefined) {
      delete target[key]
      continue
    }

    const existing = target[key]
    if (isPlainObject(existing) && isPlainObject(value)) {
      mergeInPlace(existing, value)
    } else {
      target[key] = value
    }
  }
}

const buildOhMyOpencodeModelFields = (config: Record<string, unknown>) => {
  const modelFields: OhMyOpencodeModelField[] = []

  const extractModelFields = (obj: Record<string, unknown>, prefix: string[]) => {
    for (const [key, value] of Object.entries(obj)) {
      if (value && typeof value === 'object') {
        const nested = value as Record<string, unknown>
        if ('model' in nested && typeof nested.model === 'string') {
          modelFields.push({
            key: key,
            path: [...prefix, key],
            value: nested.model as string,
            reasoningEffort:
              'reasoningEffort' in nested ? ((nested.reasoningEffort as string) ?? null) : null,
            variant: 'variant' in nested ? ((nested.variant as string) ?? null) : null,
            temperature:
              'temperature' in nested && typeof nested.temperature === 'number'
                ? nested.temperature
                : null,
          })
        } else {
          extractModelFields(nested, [...prefix, key])
        }
      } else if (typeof value === 'string') {
        modelFields.push({
          key: key,
          path: [...prefix, key],
          value: value as string,
          reasoningEffort: null,
          variant: null,
          temperature: null,
        })
      }
    }
  }

  if (config.categories) {
    extractModelFields(config.categories as Record<string, unknown>, ['categories'])
  }
  if (config.agents) {
    extractModelFields(config.agents as Record<string, unknown>, ['agents'])
  }

  return modelFields
}
import { opencodeModelRepo } from '../db/opencode-model-repository'
import { createOpencodeClient } from '@opencode-ai/sdk/v2/client'
import {
  CreateProjectUseCase,
  DeleteProjectUseCase,
  UpdateProjectUseCase,
} from '../app/project/commands'
import {
  CreateTaskUseCase,
  DeleteTaskUseCase,
  MoveTaskUseCase,
  UpdateTaskUseCase,
} from '../app/task/commands'
import { CancelRunUseCase } from '../app/run/commands/cancel-run.use-case'
import { DeleteRunUseCase } from '../app/run/commands/delete-run.use-case'
import { StartRunUseCase } from '../app/run/commands/start-run.use-case'
import { GetProjectByIdUseCase, GetProjectsUseCase } from '../app/project/queries'
import { GetRunUseCase, ListRunsByTaskUseCase } from '../app/run/queries'
import { ListTasksByBoardUseCase } from '../app/task/queries'
import { ProjectRepoAdapter } from '../infra/project/project-repo.adapter'
import { RunRepoAdapter } from '../infra/run/run-repo.adapter'
import { TaskRepoAdapter } from '../infra/task/task-repo.adapter'
import { TaskMovePolicy } from '../domain/task/task-move.policy'

const projectRepoAdapter = new ProjectRepoAdapter()
const createProjectUseCase = new CreateProjectUseCase(projectRepoAdapter)
const getProjectsUseCase = new GetProjectsUseCase(projectRepoAdapter)
const getProjectByIdUseCase = new GetProjectByIdUseCase(projectRepoAdapter)
const updateProjectUseCase = new UpdateProjectUseCase(projectRepoAdapter)
const deleteProjectUseCase = new DeleteProjectUseCase(projectRepoAdapter)
const taskRepoAdapter = new TaskRepoAdapter()
const createTaskUseCase = new CreateTaskUseCase(taskRepoAdapter)
const listTasksByBoardUseCase = new ListTasksByBoardUseCase(taskRepoAdapter)

function emitTaskUpdated(taskId: string) {
  const task = taskRepo.getById(taskId)
  if (!task) return
  emitTaskEvent({ type: 'task.updated', task })
}

const updateTaskUseCase = new UpdateTaskUseCase(
  taskRepoAdapter,
  (difficulty) => opencodeModelRepo.getModelForDifficulty(difficulty),
  emitTaskUpdated
)
const moveTaskUseCase = new MoveTaskUseCase(taskRepoAdapter, new TaskMovePolicy())
const deleteTaskUseCase = new DeleteTaskUseCase(taskRepoAdapter)
const runRepoAdapter = new RunRepoAdapter()

const updateTaskAndEmit = (taskId: string, patch: TaskUpdateInput['patch']) => {
  unwrap(updateTaskUseCase.execute({ taskId, patch }))
}

const resolveInProgressColumnId = (taskId: string): string | null => {
  const task = taskRepo.getById(taskId)
  if (!task) return null
  const columns = boardRepo.getColumns(task.boardId)
  const normalizeName = (value: string) =>
    value.toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim()
  const nameMatches = (entry: { name: string }) => {
    const normalized = normalizeName(entry.name)
    return (
      normalized === 'in progress' ||
      normalized.includes('progress') ||
      normalized === 'в работе' ||
      normalized.includes('работ')
    )
  }
  const column = columns.find(nameMatches)
  if (column) return column.id
  const fallback = columns.find((entry) => entry.orderIndex === 1)
  return fallback?.id ?? null
}

const startRunUseCase = new StartRunUseCase(
  runRepoAdapter,
  taskRepoAdapter,
  ({ taskId, roleId, mode }) => buildContextSnapshot({ taskId, roleId, mode }),
  (runId) => runService.enqueue(runId),
  resolveInProgressColumnId,
  updateTaskAndEmit
)
const cancelRunUseCase = new CancelRunUseCase((runId) => runService.cancel(runId))
const deleteRunUseCase = new DeleteRunUseCase(runRepoAdapter)
const listRunsByTaskUseCase = new ListRunsByTaskUseCase(runRepoAdapter)
const getRunUseCase = new GetRunUseCase(runRepoAdapter)

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

ipcHandlers.register('project:selectFiles', z.unknown(), async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openFile', 'multiSelections'],
    title: 'Select Files',
  })

  if (result.canceled || result.filePaths.length === 0) {
    return null
  }

  return result.filePaths
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

ipcHandlers.register('app:openPath', z.string(), async (_, path) => {
  await shell.openPath(path)
})

ipcHandlers.register('project:create', CreateProjectInputSchema, async (_, input) => {
  console.log('[IPC] Creating project:', input)
  const project = unwrap(createProjectUseCase.execute(input))
  console.log('[IPC] Project created:', project)
  return project
})

ipcHandlers.register('project:getAll', z.unknown(), async () => {
  return unwrap(getProjectsUseCase.execute())
})

ipcHandlers.register('project:getById', z.string(), async (_, id) => {
  return unwrap(getProjectByIdUseCase.execute(id))
})

ipcHandlers.register('project:update', UpdateProjectInputSchema, async (_, input) => {
  return unwrap(updateProjectUseCase.execute(input))
})

ipcHandlers.register('project:delete', DeleteProjectInputSchema, async (_, input) => {
  return unwrap(deleteProjectUseCase.execute(input.id))
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
  return TaskCreateResponseSchema.parse(unwrap(createTaskUseCase.execute(input)))
})

ipcHandlers.register('task:listByBoard', TaskListByBoardInputSchema, async (_, { boardId }) => {
  return TaskListByBoardResponseSchema.parse(unwrap(listTasksByBoardUseCase.execute(boardId)))
})

ipcHandlers.register('task:update', TaskUpdateInputSchema, async (_, { taskId, patch }) => {
  return TaskUpdateResponseSchema.parse(unwrap(updateTaskUseCase.execute({ taskId, patch })))
})

ipcHandlers.register(
  'task:move',
  TaskMoveInputSchema,
  async (_, { taskId, toColumnId, toIndex }) => {
    return TaskMoveResponseSchema.parse(
      unwrap(moveTaskUseCase.execute({ taskId, toColumnId, toIndex }))
    )
  }
)

ipcHandlers.register('task:delete', TaskDeleteInputSchema, async (_, { taskId }) => {
  return TaskDeleteResponseSchema.parse(unwrap(deleteTaskUseCase.execute({ taskId })))
})

ipcHandlers.register('tag:create', TagCreateInputSchema, async (_, input) => {
  return tagRepo.create(input)
})

ipcHandlers.register('tag:update', TagUpdateInputSchema, async (_, input) => {
  return tagRepo.update(input.id, input)
})

ipcHandlers.register('tag:delete', TagDeleteInputSchema, async (_, { id }) => {
  return { ok: tagRepo.delete(id) }
})

ipcHandlers.register('tag:list', TagListInputSchema, async () => {
  const tags = tagRepo.listAll()
  return TagListResponseSchema.parse({ tags })
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

ipcHandlers.register('appSetting:getSidebarCollapsed', z.unknown(), async () => {
  const collapsed = appSettingsRepo.getSidebarCollapsed()
  return AppSettingGetSidebarCollapsedResponseSchema.parse({ collapsed })
})

ipcHandlers.register(
  'appSetting:setSidebarCollapsed',
  AppSettingSetSidebarCollapsedInputSchema,
  async (_, input) => {
    appSettingsRepo.setSidebarCollapsed(input.collapsed)
    return AppSettingSetSidebarCollapsedResponseSchema.parse({ ok: true })
  }
)

ipcHandlers.register(
  'appSetting:getDefaultModel',
  AppSettingGetDefaultModelInputSchema,
  async (_, input) => {
    const modelName = appSettingsRepo.getDefaultModel(input.difficulty)
    return AppSettingGetDefaultModelResponseSchema.parse({ modelName })
  }
)

ipcHandlers.register(
  'appSetting:setDefaultModel',
  AppSettingSetDefaultModelInputSchema,
  async (_, input) => {
    appSettingsRepo.setDefaultModel(input.difficulty, input.modelName)
    return AppSettingSetDefaultModelResponseSchema.parse({ ok: true })
  }
)

ipcHandlers.register('database:delete', DatabaseDeleteInputSchema, async () => {
  dbManager.deleteDatabase()
  return DatabaseDeleteResponseSchema.parse({ ok: true })
})

ipcHandlers.register(
  'opencode:generateUserStory',
  OpenCodeGenerateUserStoryInputSchema,
  async (_, input) => {
    const previousStatus = taskRepo.getById(input.taskId)?.status ?? null
    updateTaskAndEmit(input.taskId, { status: 'generating' })
    try {
      const runId = await opencodeExecutor.generateUserStory(input.taskId)
      return OpenCodeGenerateUserStoryResponseSchema.parse({ runId })
    } catch (error) {
      if (previousStatus) {
        updateTaskAndEmit(input.taskId, { status: previousStatus })
      }
      throw error
    }
  }
)

ipcHandlers.register(
  'opencode:getSessionStatus',
  OpenCodeSessionStatusInputSchema,
  async (_, input) => {
    const status = opencodeSessionWorker.getSessionStatus(input.sessionId)
    if (!status) {
      throw new Error('Session not tracked')
    }
    return OpenCodeSessionStatusResponseSchema.parse(status)
  }
)

ipcHandlers.register('opencode:getActiveSessions', z.object({}), async () => {
  return OpenCodeActiveSessionsResponseSchema.parse({
    count: opencodeSessionWorker.getActiveCount(),
  })
})

ipcHandlers.register(
  'opencode:getSessionMessages',
  OpenCodeSessionMessagesInputSchema,
  async (_, input) => {
    const messages = await opencodeSessionWorker.getSessionMessages(input.sessionId, input.limit)
    return OpenCodeSessionMessagesResponseSchema.parse({
      sessionId: input.sessionId,
      messages,
    })
  }
)

ipcHandlers.register(
  'opencode:getSessionTodos',
  OpenCodeSessionTodosInputSchema,
  async (_, input) => {
    const todos = await sessionManager.getTodos(input.sessionId)
    return OpenCodeSessionTodosResponseSchema.parse({
      sessionId: input.sessionId,
      todos,
    })
  }
)

ipcHandlers.register(
  'opencode:subscribeToEvents',
  z.object({ sessionID: z.string() }),
  async (event, input) => {
    const { sessionID } = input
    const webContents = event.sender
    const subscriberId = `renderer:${webContents.id}`

    console.log(`[IPC] opencode:subscribeToEvents called for session ${sessionID}`)

    await sessionManager.subscribeToSessionEvents(
      sessionID,
      subscriberId,
      (sessionEvent: SessionEvent) => {
        console.log(
          `[IPC] Sending event to renderer: ${sessionEvent.type} for session ${sessionEvent.sessionId}`
        )
        webContents.send('opencode:event', sessionEvent)
      }
    )

    console.log(`[IPC] Successfully subscribed to session ${sessionID}`)
    return { ok: true, subscribed: true }
  }
)

ipcHandlers.register(
  'opencode:unsubscribeFromEvents',
  z.object({ sessionID: z.string() }),
  async (event, input) => {
    const { sessionID } = input
    const webContents = event.sender
    const subscriberId = `renderer:${webContents.id}`
    await sessionManager.unsubscribeFromSessionEvents(sessionID, subscriberId)
    return { ok: true, subscribed: false }
  }
)

const taskEventSubscriptions = new Map<number, () => void>()

ipcHandlers.register('task:subscribeToEvents', z.object({}), async (event) => {
  const webContents = event.sender
  if (taskEventSubscriptions.has(webContents.id)) {
    return { ok: true, subscribed: true }
  }

  const unsubscribe = onTaskEvent((taskEvent) => {
    webContents.send('task:event', taskEvent)
  })

  taskEventSubscriptions.set(webContents.id, unsubscribe)

  webContents.once('destroyed', () => {
    const current = taskEventSubscriptions.get(webContents.id)
    if (current) current()
    taskEventSubscriptions.delete(webContents.id)
  })

  return { ok: true, subscribed: true }
})

ipcHandlers.register('task:unsubscribeFromEvents', z.object({}), async (event) => {
  const webContents = event.sender
  const unsubscribe = taskEventSubscriptions.get(webContents.id)
  if (unsubscribe) {
    unsubscribe()
    taskEventSubscriptions.delete(webContents.id)
  }
  return { ok: true, subscribed: false }
})

ipcHandlers.register(
  'opencode:isSubscribed',
  z.object({ sessionID: z.string() }),
  async (_, input) => {
    const { sessionID } = input
    const subscribed = sessionManager.isSubscribedToSessionEvents(sessionID)
    return { ok: true, subscribed }
  }
)

ipcHandlers.register('vosk:downloadModel', VoskModelDownloadInputSchema, async (_, input) => {
  const { lang } = input
  const buffer = await downloadModelIfNeeded(lang)
  return VoskModelDownloadResponseSchema.parse({
    path: buffer.toString('base64'),
  })
})

ipcHandlers.register('opencode:listModels', z.unknown(), async () => {
  return OpencodeModelsListResponseSchema.parse({ models: opencodeModelRepo.getAll() })
})

ipcHandlers.register('opencode:logProviders', z.object({}), async () => {
  await sessionManager.logProviders()
  return z.object({ success: z.boolean() }).parse({ success: true })
})

ipcHandlers.register('opencode:listEnabledModels', z.unknown(), async () => {
  return OpencodeModelsListResponseSchema.parse({ models: opencodeModelRepo.getEnabled() })
})

ipcHandlers.register('opencode:refreshModels', z.unknown(), async () => {
  const baseUrl = process.env.OPENCODE_URL || 'http://127.0.0.1:4096'
  const client = createOpencodeClient({
    baseUrl,
    throwOnError: true,
    directory: app.getPath('userData'),
  })

  const providers = await client.provider.list()
  const allProviders = providers.data?.all || []
  const connected = new Set(providers.data?.connected || [])

  const variantsByModel = new Map<string, Set<string>>()

  for (const provider of allProviders) {
    if (!provider || typeof provider !== 'object') continue
    const providerInfo = provider as {
      id?: string
      models?: Record<string, unknown>
    }
    if (!providerInfo.id) continue
    if (!connected.has(providerInfo.id)) continue

    const models = Object.values(providerInfo.models || {})
    for (const model of models) {
      if (!model || typeof model !== 'object') continue
      const modelInfo = model as {
        id?: string
        reasoning?: boolean
        variants?: Record<string, unknown>
      }
      if (!modelInfo.id) continue

      const baseName = `${providerInfo.id}/${modelInfo.id}`

      if (!variantsByModel.has(baseName)) {
        variantsByModel.set(baseName, new Set())
      }

      const set = variantsByModel.get(baseName)!
      if (modelInfo.variants) {
        for (const variant of Object.keys(modelInfo.variants)) {
          set.add(variant)
        }
      }
    }
  }

  const models = Array.from(variantsByModel.entries()).map(([name, variants]) => ({
    name,
    variants: Array.from(variants).sort(),
  }))

  opencodeModelRepo.syncFromSdkModels(models)
  return OpencodeModelsListResponseSchema.parse({ models: opencodeModelRepo.getAll() })
})

ipcHandlers.register('opencode:toggleModel', OpencodeModelToggleInputSchema, async (_, input) => {
  const updatedModel = opencodeModelRepo.updateEnabled(input.name, input.enabled)
  if (!updatedModel) {
    throw new Error(`Model "${input.name}" not found`)
  }
  return OpencodeModelToggleResponseSchema.parse({ model: updatedModel })
})

ipcHandlers.register(
  'opencode:updateModelDifficulty',
  OpencodeModelUpdateDifficultyInputSchema,
  async (_, input) => {
    const updatedModel = opencodeModelRepo.updateDifficulty(input.name, input.difficulty)
    if (!updatedModel) {
      throw new Error(`Model "${input.name}" not found`)
    }
    return OpencodeModelUpdateDifficultyResponseSchema.parse({ model: updatedModel })
  }
)

ipcHandlers.register('opencode:sendMessage', OpencodeSendMessageInputSchema, async (_, input) => {
  await sessionManager.sendPrompt(input.sessionId, input.message)
  return OpencodeSendMessageResponseSchema.parse({ ok: true })
})

// OhMyOpencode config handlers
ipcHandlers.register('appSetting:getOhMyOpencodePath', z.unknown(), async () => {
  const configPath = appSettingsRepo.getOhMyOpencodeConfigPath()
  return AppSettingGetOhMyOpencodePathResponseSchema.parse({ path: configPath })
})

ipcHandlers.register(
  'appSetting:setOhMyOpencodePath',
  AppSettingSetOhMyOpencodePathInputSchema,
  async (_, input) => {
    appSettingsRepo.setOhMyOpencodeConfigPath(input.path)
    return AppSettingSetOhMyOpencodePathResponseSchema.parse({ ok: true })
  }
)

ipcHandlers.register(
  'ohMyOpencode:readConfig',
  OhMyOpencodeReadConfigInputSchema,
  async (_, input) => {
    const fileContent = await fs.readFile(input.path, 'utf-8')

    const config = parse(fileContent) as Record<string, unknown>
    const modelFields = buildOhMyOpencodeModelFields(config)

    return OhMyOpencodeReadConfigResponseSchema.parse({
      config,
      modelFields,
    })
  }
)

ipcHandlers.register(
  'ohMyOpencode:saveConfig',
  OhMyOpencodeSaveConfigInputSchema,
  async (_, input) => {
    const fileContent = await fs.readFile(input.path, 'utf-8')
    const originalPath = path.join(path.dirname(input.path), ORIGINAL_PRESET_NAME)
    const originalExists = await fs
      .stat(originalPath)
      .then(() => true)
      .catch(() => false)

    if (!originalExists) {
      await fs.writeFile(originalPath, fileContent, 'utf-8')
    }
    const parsedConfig = parse(fileContent) as unknown

    let outputConfig: unknown = input.config

    if (isPlainObject(parsedConfig) && isPlainObject(input.config)) {
      mergeInPlace(parsedConfig, input.config)
      outputConfig = parsedConfig
    }

    await fs.writeFile(input.path, JSON.stringify(outputConfig, null, 2), 'utf-8')
    return OhMyOpencodeSaveConfigResponseSchema.parse({ ok: true })
  }
)

ipcHandlers.register(
  'ohMyOpencode:listPresets',
  OhMyOpencodeListPresetsInputSchema,
  async (_, input) => {
    const presetDir = path.dirname(input.path)
    const baseConfigName = path.basename(input.path)
    const entries = await fs.readdir(presetDir)
    const presets = entries
      .filter(
        (entry) =>
          entry.endsWith(PRESET_SUFFIX) &&
          entry !== ORIGINAL_PRESET_NAME &&
          entry !== baseConfigName
      )
      .map((entry) => entry.replace(PRESET_SUFFIX, ''))
      .sort((a, b) => a.localeCompare(b))

    return OhMyOpencodeListPresetsResponseSchema.parse({ presets })
  }
)

ipcHandlers.register(
  'ohMyOpencode:loadPreset',
  OhMyOpencodeLoadPresetInputSchema,
  async (_, input) => {
    const presetPath = path.join(path.dirname(input.path), `${input.presetName}${PRESET_SUFFIX}`)
    const fileContent = await fs.readFile(presetPath, 'utf-8')
    const config = parse(fileContent) as Record<string, unknown>
    const modelFields = buildOhMyOpencodeModelFields(config)

    return OhMyOpencodeLoadPresetResponseSchema.parse({
      config,
      modelFields,
    })
  }
)

ipcHandlers.register(
  'ohMyOpencode:savePreset',
  OhMyOpencodeSavePresetInputSchema,
  async (_, input) => {
    const presetPath = path.join(path.dirname(input.path), `${input.presetName}${PRESET_SUFFIX}`)
    await fs.writeFile(presetPath, JSON.stringify(input.config, null, 2), 'utf-8')
    return OhMyOpencodeSavePresetResponseSchema.parse({ ok: true, presetPath })
  }
)

ipcHandlers.register(
  'ohMyOpencode:backupConfig',
  OhMyOpencodeBackupConfigInputSchema,
  async (_, input) => {
    const fileContent = await fs.readFile(input.path, 'utf-8')
    const backupPath = `${input.path}.backup`
    await fs.writeFile(backupPath, fileContent, 'utf-8')
    return OhMyOpencodeBackupConfigResponseSchema.parse({ ok: true, backupPath })
  }
)

ipcHandlers.register(
  'ohMyOpencode:restoreConfig',
  OhMyOpencodeRestoreConfigInputSchema,
  async (_, input) => {
    const backupPath = `${input.path}.backup`
    const backupContent = await fs.readFile(backupPath, 'utf-8')
    await fs.writeFile(input.path, backupContent, 'utf-8')
    return OhMyOpencodeRestoreConfigResponseSchema.parse({ ok: true })
  }
)

ipcHandlers.register('dialog:showOpenDialog', z.unknown(), async (_, input) => {
  const result = await dialog.showOpenDialog(input as any)
  return result
})

ipcHandlers.register('fileSystem:exists', z.object({ path: z.string() }), async (_, input) => {
  try {
    await fs.access(input.path, fs.constants.F_OK)
    return { exists: true }
  } catch {
    return { exists: false }
  }
})

registerDiagnosticsHandlers()

console.log('[IPC] Handlers registered')
