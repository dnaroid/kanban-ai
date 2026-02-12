import { ipcHandlers } from '../validation'
import {
  TagCreateInputSchema,
  TagDeleteInputSchema,
  TagListInputSchema,
  TagListResponseSchema,
  TagUpdateInputSchema,
} from "../../shared/src/types/ipc.js'
import type { AppContext } from '../composition/create-app-context'

export function registerTagsHandlers(context: AppContext): void {
  const { createTag, updateTag, deleteTag, listTags } = context

  ipcHandlers.register('tag:create', TagCreateInputSchema, async (_, input) => {
    return createTag(input)
  })

  ipcHandlers.register('tag:update', TagUpdateInputSchema, async (_, input) => {
    return updateTag(input.id, input)
  })

  ipcHandlers.register('tag:delete', TagDeleteInputSchema, async (_, { id }) => {
    return { ok: deleteTag(id) }
  })

  ipcHandlers.register('tag:list', TagListInputSchema, async () => {
    const tags = listTags()
    return TagListResponseSchema.parse({ tags })
  })
}
