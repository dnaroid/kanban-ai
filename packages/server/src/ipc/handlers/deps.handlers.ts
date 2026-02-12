import { ipcHandlers } from '../validation'
import {
  DepsAddInputSchema,
  DepsAddResponseSchema,
  DepsListInputSchema,
  DepsListResponseSchema,
  DepsRemoveInputSchema,
  DepsRemoveResponseSchema,
} from '../../../../shared/dist/types/ipc'
import { dependencyService } from '../../deps/dependency-service'

export function registerDepsHandlers(): void {
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
}
