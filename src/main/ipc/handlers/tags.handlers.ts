import { ipcHandlers } from '../validation'
import {
  TagCreateInputSchema,
  TagDeleteInputSchema,
  TagListInputSchema,
  TagListResponseSchema,
  TagUpdateInputSchema,
} from '../../../shared/types/ipc.js'
import { tagRepo } from '../../db/tag-repository'

export function registerTagsHandlers(): void {
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
}
