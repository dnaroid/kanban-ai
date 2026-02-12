import { ipcHandlers } from '../validation'
import { z } from 'zod'
import {
  CreateProjectInputSchema,
  DeleteProjectInputSchema,
  UpdateProjectInputSchema,
} from '@shared/types/ipc.js'
import { unwrap } from '@shared/ipc'
import type { AppContext } from '../composition/create-app-context'

export function registerProjectHandlers(context: AppContext): void {
  const {
    createProjectUseCase,
    getProjectsUseCase,
    getProjectByIdUseCase,
    updateProjectUseCase,
    deleteProjectUseCase,
  } = context

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
}
