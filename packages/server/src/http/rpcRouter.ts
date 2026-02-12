import type { ServerContainer } from '../di/app-container'
import { eventBus } from '../events/eventBus'
import { sendSseEvent } from '../http/sseHandler'
import { dependencyService } from '../deps/dependency-service'
// Local unwrap to avoid module resolution issues with @shared
type Result<T> = { ok: true; data: T } | { ok: false; error: { message: string } }
const unwrap = <T>(result: Result<T>): T => {
  if (!result.ok) throw new Error(result.error.message)
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
