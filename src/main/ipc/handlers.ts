import { app, dialog } from 'electron'
import path from 'path'
import { ipcHandlers } from './validation'
import { z } from 'zod'
import { registerDiagnosticsHandlers } from './diagnostics-handlers'
import {
  AppInfoSchema,
  CreateProjectInputSchema,
  UpdateProjectInputSchema,
  DeleteProjectInputSchema,
  CreateTaskInputSchema,
} from '../../shared/types/ipc'
import { projectRepo } from '../db/project-repository'
import { boardRepo } from '../db/board-repository'
import { taskRepo } from '../db/task-repository'

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

ipcHandlers.register('board:getDefault', z.string(), async (_, projectId) => {
  return boardRepo.getDefault(projectId)
})

ipcHandlers.register(
  'board:updateColumns',
  z.object({ boardId: z.string(), columns: z.array(z.any()) }),
  async (_, { boardId, columns }) => {
    boardRepo.updateColumns(boardId, columns)
    return { success: true }
  }
)

ipcHandlers.register('task:create', CreateTaskInputSchema, async (_, input) => {
  return taskRepo.create(input)
})

ipcHandlers.register('task:listByBoard', z.string(), async (_, boardId) => {
  return taskRepo.listByBoard(boardId)
})

ipcHandlers.register(
  'task:update',
  z.object({ id: z.string(), patch: z.any() }),
  async (_, { id, patch }) => {
    taskRepo.update(id, patch)
    return { success: true }
  }
)

ipcHandlers.register(
  'task:move',
  z.object({ taskId: z.string(), toColumnId: z.string(), toIndex: z.number() }),
  async (_, { taskId, toColumnId, toIndex }) => {
    taskRepo.move(taskId, toColumnId, toIndex)
    return { success: true }
  }
)

registerDiagnosticsHandlers()

console.log('[IPC] Handlers registered')
