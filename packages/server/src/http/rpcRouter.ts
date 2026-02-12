import type { ServerContainer } from '../di/app-container'
import { eventBus } from '../events/eventBus'
import { sendSseEvent } from '../http/sseHandler'

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

  // Project
  router.set('project:create', async (params) => {
    return container.createProjectUseCase.execute(params)
  })

  router.set('project:selectFolder', async () => {
    return container.selectFolder()
  })

  // Task
  router.set('task:create', async (params) => {
    return container.createTaskUseCase.execute(params)
  })

  router.set('task:update', async (params) => {
    return container.updateTaskUseCase.execute(params)
  })

  router.set('task:delete', async (params) => {
    return container.deleteTaskUseCase.execute(params)
  })

  // Run
  router.set('run:start', async (params) => {
    return container.startRunUseCase.execute(params)
  })

  router.set('run:cancel', async (params) => {
    return container.cancelRunUseCase.execute(params)
  })

  // Tag
  router.set('tag:list', async () => {
    return container.listTags()
  })

  // Analytics
  router.set('analytics:getOverview', async () => {
    return container.getAnalyticsOverview()
  })

  // Board
  router.set('board:getDefault', async (params) => {
    return container.getDefaultBoard(params.projectId)
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
