import { app } from 'electron'
import { ipcHandlers } from './validation'
import { AppInfoSchema, CreateProjectInputSchema, UpdateProjectInputSchema, DeleteProjectInputSchema } from '../../shared/types/ipc'
import { z } from 'zod'
import { registerDiagnosticsHandlers } from './diagnostics-handlers'
import { projectRepo } from '../db/project-repository'

ipcHandlers.register('app:getInfo', z.unknown(), async () => {
  return AppInfoSchema.parse({
    name: app.getName(),
    version: app.getVersion(),
    platform: process.platform,
    arch: process.arch
  })
})

ipcHandlers.register('project:create', CreateProjectInputSchema, async (_, input) => {
  return projectRepo.create(input)
})

ipcHandlers.register('project:getAll', z.unknown(), async () => {
  return projectRepo.getAll()
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

registerDiagnosticsHandlers()

console.log('[IPC] Handlers registered')
