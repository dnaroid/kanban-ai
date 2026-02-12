import type { ServerContainer } from '../di/app-container'
import { eventBus } from '../events/eventBus'
import { sendSseEvent } from '../http/sseHandler'
import { dependencyService } from '../deps/dependency-service'
import { sessionManager } from '../run/opencode-session-manager'
import { pluginService } from '../plugins/plugin-service'
import { dbManager } from '../db'
// Local unwrap to avoid module resolution issues with @shared
type Result<T> = { ok: true; data: T } | { ok: false; error: { message: string } }
const unwrap = <T>(result: Result<T>): T => {
  if (!result.ok) {
    const errorResult = result as { ok: false; error: { message: string } }
    throw new Error(errorResult.error.message)
  }
  return result.data
}
import path from 'node:path'
import fs from 'node:fs/promises'
import os from 'node:os'

type BrowseDirectoryParams = {
  path?: string
  lastSelectedPath?: string
}

type BrowseDirectoryEntry = {
  name: string
  path: string
  isDirectory: boolean
}

async function resolveBrowsePath(
  container: ServerContainer,
  requestedPath?: string,
  lastSelectedPath?: string
): Promise<string> {
  if (typeof requestedPath === 'string' && requestedPath.trim().length > 0) {
    return path.resolve(requestedPath)
  }

  if (typeof lastSelectedPath === 'string' && lastSelectedPath.trim().length > 0) {
    return path.dirname(path.resolve(lastSelectedPath))
  }

  const lastProjectId = await container.getLastProjectId()
  if (lastProjectId) {
    const projectResult = await container.getProjectByIdUseCase.execute(lastProjectId)
    if (projectResult.ok && projectResult.data?.path) {
      return path.dirname(path.resolve(projectResult.data.path))
    }
  }

  return os.homedir()
}

async function listBrowseEntries(targetPath: string): Promise<BrowseDirectoryEntry[]> {
  const entries = await fs.readdir(targetPath, { withFileTypes: true })

  return entries
    .map((entry) => ({
      name: entry.name,
      path: path.join(targetPath, entry.name),
      isDirectory: entry.isDirectory(),
    }))
    .sort((a, b) => {
      if (a.isDirectory && !b.isDirectory) return -1
      if (!a.isDirectory && b.isDirectory) return 1
      return a.name.localeCompare(b.name)
    })
}

export function createRpcRouter(
  container: ServerContainer
): Map<string, (params: any) => Promise<any>> {
  const router = new Map<string, (params: any) => Promise<any>>()

  // App
  router.set('app:getInfo', async () => {
    return {
      name: 'Kanban AI',
      version: '0.1.0',
      platform: process.platform,
      mode: 'local-web',
      userDataPath: container.paths.getDataDir(),
    }
  })

  router.set('appSetting:getLastProjectId', async () => {
    const projectId = await container.getLastProjectId()
    return { projectId }
  })

  router.set('appSetting:setLastProjectId', async (params) => {
    await container.setLastProjectId(params.projectId)
    return { ok: true }
  })

  router.set('appSetting:getSidebarCollapsed', async () => {
    const collapsed = await container.getSidebarCollapsed()
    return { collapsed }
  })

  router.set('appSetting:setSidebarCollapsed', async (params) => {
    await container.setSidebarCollapsed(params.collapsed)
    return { ok: true }
  })

  router.set('appSetting:getDefaultModel', async (params) => {
    const modelName = await container.getDefaultModel(params.difficulty)
    return { modelName }
  })

  router.set('appSetting:setDefaultModel', async (params) => {
    await container.setDefaultModel(params.difficulty, params.modelName)
    return { ok: true }
  })

  router.set('appSetting:getOhMyOpencodePath', async () => {
    const opencodePath = await container.getOhMyOpencodePath()
    return { path: opencodePath }
  })

  router.set('appSetting:setOhMyOpencodePath', async (params) => {
    await container.setOhMyOpencodePath(params.path)
    return { ok: true }
  })

  router.set('appSetting:getRetentionPolicy', async () => {
    const enabled = await container.getRetentionEnabled()
    const days = await container.getRetentionDays()
    return { enabled, days }
  })

  router.set('appSetting:setRetentionPolicy', async (params) => {
    await container.setRetentionEnabled(params.enabled)
    await container.setRetentionDays(params.days)
    return { ok: true }
  })

  router.set('appSetting:runRetentionCleanup', async () => {
    return { deletedRuns: 0, deletedArtifacts: 0, dryRun: true }
  })

  // Project
  router.set('project:create', async (params) => {
    return unwrap(container.createProjectUseCase.execute(params))
  })

  router.set('project:getAll', async () => {
    return unwrap(container.getProjectsUseCase.execute())
  })

  router.set('project:getById', async (id) => {
    return unwrap(container.getProjectByIdUseCase.execute(id))
  })

  router.set('project:update', async (params) => {
    return unwrap(container.updateProjectUseCase.execute(params))
  })

  router.set('project:delete', async (params) => {
    return unwrap(container.deleteProjectUseCase.execute(params))
  })

  router.set('project:selectFolder', async () => {
    const selectedPath = await container.selectFolder()
    if (!selectedPath) return null
    return {
      path: selectedPath,
      name: path.basename(selectedPath),
    }
  })

  router.set('project:selectFiles', async () => {
    return null
  })

  router.set('project:browseDirectory', async (params: BrowseDirectoryParams = {}) => {
    const currentPath = await resolveBrowsePath(container, params.path, params.lastSelectedPath)
    const stats = await fs.stat(currentPath)
    if (!stats.isDirectory()) {
      throw new Error(`Not a directory: ${currentPath}`)
    }

    const parentPath = path.dirname(currentPath)
    const entries = await listBrowseEntries(currentPath)

    return {
      currentPath,
      parentPath: parentPath === currentPath ? null : parentPath,
      homePath: os.homedir(),
      entries,
    }
  })

  // Task
  router.set('task:create', async (params) => {
    return unwrap(container.createTaskUseCase.execute(params))
  })

  router.set('task:listByBoard', async (params) => {
    return unwrap(container.listTasksByBoardUseCase.execute(params.boardId))
  })

  router.set('task:update', async (params) => {
    return unwrap(container.updateTaskUseCase.execute(params))
  })

  router.set('task:delete', async (params) => {
    return unwrap(container.deleteTaskUseCase.execute(params))
  })

  router.set('task:move', async (params) => {
    return unwrap(container.moveTaskUseCase.execute(params))
  })

  // Tag
  router.set('tag:create', async (params) => {
    return container.createTag(params)
  })

  router.set('tag:update', async (params) => {
    return container.updateTag(params.id, params)
  })

  router.set('tag:delete', async (params) => {
    return { ok: container.deleteTag(params.id) }
  })

  // Run
  router.set('run:get', async (params) => {
    return container.getRunUseCase.execute(params.runId)
  })

  // Schedule
  router.set('schedule:get', async (params) => {
    return { tasks: container.listScheduleByProject(params.projectId) }
  })

  router.set('schedule:update', async (params) => {
    return container.updateSchedule(params)
  })

  // Deps
  router.set('deps:add', async (params) => {
    const link = dependencyService.add({
      fromTaskId: params.fromTaskId,
      toTaskId: params.toTaskId,
      type: params.type,
    })
    return { link }
  })

  router.set('deps:remove', async (params) => {
    dependencyService.remove(params.linkId)
    return { ok: true }
  })

  // Opencode
  router.set('opencode:getSessionStatus', async (params) => {
    const sessionInfo = await sessionManager.getSessionInfo(params.sessionId)
    if (!sessionInfo) {
      throw new Error(`Session not found: ${params.sessionId}`)
    }
    return {
      sessionId: params.sessionId,
      runId: params.sessionId,
      status: 'running',
      messageCount: 0,
    }
  })

  router.set('opencode:getActiveSessions', async () => {
    const sessions = sessionManager.getActiveSessions()
    return { count: sessions.length }
  })

  router.set('opencode:refreshModels', async () => {
    const client = container.createOpencodeClientInstance()
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

      if (!providerInfo.id || !connected.has(providerInfo.id)) continue

      const models = Object.values(providerInfo.models || [])
      for (const model of models) {
        if (!model || typeof model !== 'object') continue
        const modelInfo = model as {
          id?: string
          variants?: Record<string, unknown>
        }
        if (!modelInfo.id) continue

        const baseName = `${providerInfo.id}/${modelInfo.id}`
        const set = variantsByModel.get(baseName) ?? new Set<string>()
        if (modelInfo.variants) {
          for (const variant of Object.keys(modelInfo.variants)) {
            set.add(variant)
          }
        }
        variantsByModel.set(baseName, set)
      }
    }

    const models = Array.from(variantsByModel.entries()).map(([name, variants]) => ({
      name,
      variants: Array.from(variants).sort(),
    }))

    container.syncSdkModels(models)
    return { models: container.listAllModels() }
  })

  router.set('opencode:toggleModel', async (params) => {
    const updatedModel = container.updateModelEnabled(params.name, params.enabled)
    if (!updatedModel) {
      throw new Error(`Model "${params.name}" not found`)
    }
    return { model: updatedModel }
  })

  router.set('opencode:updateModelDifficulty', async (params) => {
    const updatedModel = container.updateModelDifficulty(params.name, params.difficulty)
    if (!updatedModel) {
      throw new Error(`Model "${params.name}" not found`)
    }
    return { model: updatedModel }
  })

  router.set('opencode:sendMessage', async (params) => {
    await sessionManager.sendPrompt(params.sessionId, params.message)
    return { ok: true }
  })

  // Plugins
  router.set('plugins:list', async () => {
    return { plugins: pluginService.list() }
  })

  router.set('plugins:enable', async (params) => {
    return { plugin: pluginService.enable(params.pluginId, params.enabled) }
  })

  router.set('plugins:reload', async () => {
    return { plugins: pluginService.reload() }
  })

  // Dialog (mock for web)
  router.set('dialog:showOpenDialog', async () => {
    return { canceled: true, filePaths: [] }
  })

  // App
  router.set('app:openPath', async (params) => {
    console.log('[MOCK] app:openPath:', params)
    return { ok: true }
  })

  // FileSystem
  router.set('fileSystem:exists', async (params) => {
    try {
      await fs.access(params.path)
      return { exists: true }
    } catch {
      return { exists: false }
    }
  })

  // Vosk
  router.set('vosk:downloadModel', async (params) => {
    const { downloadModelIfNeeded } = await import('../vosk/vosk-model-loader')
    const buffer = await downloadModelIfNeeded(params.lang)
    return { path: buffer.toString('base64') }
  })

  // OhMyOpencode
  router.set('ohMyOpencode:readConfig', async (params) => {
    const { parse } = await import('jsonc-parser')
    const { buildOhMyOpencodeModelFields } = await import('../oh-my-opencode/config-utils')
    const fileContent = await fs.readFile(params.path, 'utf-8')
    const config = parse(fileContent) as Record<string, unknown>
    const modelFields = buildOhMyOpencodeModelFields(config)
    return { config, modelFields }
  })

  router.set('ohMyOpencode:saveConfig', async (params) => {
    const { parse } = await import('jsonc-parser')
    const { ORIGINAL_PRESET_NAME, isPlainObject, mergeInPlace } =
      await import('../oh-my-opencode/config-utils')
    const fileContent = await fs.readFile(params.path, 'utf-8')
    const originalPath = path.join(path.dirname(params.path), ORIGINAL_PRESET_NAME)
    const originalExists = await fs
      .stat(originalPath)
      .then(() => true)
      .catch(() => false)
    if (!originalExists) {
      await fs.writeFile(originalPath, fileContent, 'utf-8')
    }
    const parsedConfig = parse(fileContent) as unknown
    let outputConfig: unknown = params.config
    if (isPlainObject(parsedConfig) && isPlainObject(params.config)) {
      mergeInPlace(parsedConfig, params.config)
      outputConfig = parsedConfig
    }
    await fs.writeFile(params.path, JSON.stringify(outputConfig, null, 2), 'utf-8')
    return { ok: true }
  })

  router.set('ohMyOpencode:listPresets', async (params) => {
    const { PRESET_SUFFIX, ORIGINAL_PRESET_NAME } = await import('../oh-my-opencode/config-utils')
    const presetDir = path.dirname(params.path)
    const baseConfigName = path.basename(params.path)
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
    return { presets }
  })

  router.set('ohMyOpencode:loadPreset', async (params) => {
    const { parse } = await import('jsonc-parser')
    const { PRESET_SUFFIX, buildOhMyOpencodeModelFields } =
      await import('../oh-my-opencode/config-utils')
    const presetPath = path.join(path.dirname(params.path), `${params.presetName}${PRESET_SUFFIX}`)
    const fileContent = await fs.readFile(presetPath, 'utf-8')
    const config = parse(fileContent) as Record<string, unknown>
    const modelFields = buildOhMyOpencodeModelFields(config)
    return { config, modelFields }
  })

  router.set('ohMyOpencode:savePreset', async (params) => {
    const { PRESET_SUFFIX } = await import('../oh-my-opencode/config-utils')
    const presetPath = path.join(path.dirname(params.path), `${params.presetName}${PRESET_SUFFIX}`)
    await fs.writeFile(presetPath, JSON.stringify(params.config, null, 2), 'utf-8')
    return { ok: true, presetPath }
  })

  router.set('ohMyOpencode:backupConfig', async (params) => {
    const fileContent = await fs.readFile(params.path, 'utf-8')
    const backupPath = `${params.path}.backup`
    await fs.writeFile(backupPath, fileContent, 'utf-8')
    return { ok: true, backupPath }
  })

  router.set('ohMyOpencode:restoreConfig', async (params) => {
    const backupPath = `${params.path}.backup`
    const backupContent = await fs.readFile(backupPath, 'utf-8')
    await fs.writeFile(params.path, backupContent, 'utf-8')
    return { ok: true }
  })

  // Plugins
  router.set('plugins:install', async (params) => {
    return { plugin: pluginService.install(params.path) }
  })

  // Database
  router.set('database:delete', async () => {
    dbManager.deleteDatabase()
    return { ok: true }
  })

  // Run
  router.set('run:start', async (params) => {
    return unwrap(container.startRunUseCase.execute(params))
  })

  router.set('run:cancel', async (params) => {
    return unwrap(await container.cancelRunUseCase.execute(params))
  })

  router.set('run:listByTask', async (params) => {
    return unwrap(container.listRunsByTaskUseCase.execute(params.taskId))
  })

  router.set('run:delete', async (params) => {
    return unwrap(container.deleteRunUseCase.execute(params.runId))
  })

  // Deps
  router.set('deps:list', async (params) => {
    return { links: dependencyService.list(params.taskId) }
  })

  // Roles
  router.set('roles:list', async () => {
    return { roles: container.listAgentRoles() }
  })

  // Opencode
  router.set('opencode:listModels', async () => {
    return { models: container.listAllModels() }
  })
  router.set('opencode:listEnabledModels', async () => {
    return { models: container.listEnabledModels() }
  })

  // Tag
  router.set('tag:list', async () => {
    return { tags: container.listTags() }
  })

  // Analytics
  router.set('analytics:getOverview', async () => {
    return container.getAnalyticsOverview()
  })

  // Board
  router.set('board:getDefault', async (params) => {
    const board = container.getDefaultBoard(params.projectId)
    const { columns = [], ...boardWithoutColumns } = board
    return { board: boardWithoutColumns, columns }
  })

  router.set('board:updateColumns', async (params) => {
    return container.updateBoardColumns(params.boardId, params.columns)
  })

  // Events
  router.set('events:tail', async (params) => {
    return container.listRunEvents(params.runId, params.afterTs, params.limit)
  })

  // Search
  router.set('search:query', async (params) => {
    return container.queryTasks(params.query, params.filters, params.limit, params.offset)
  })

  return router
}

export type RpcHandler = (params: any) => Promise<any>
