import { ipcHandlers } from '../validation'
import { SearchQueryInputSchema, SearchQueryResponseSchema } from '../../../../shared/dist/types/ipc'
import { searchService } from '../../search/search-service'

export function registerSearchHandlers(): void {
  ipcHandlers.register('search:query', SearchQueryInputSchema, async (_, input) => {
    const filters = input.filters
    const limit = input.limit ?? 50
    const offset = input.offset ?? 0
    const results: Array<unknown> = []

    if (!filters?.entity || filters.entity === 'task') {
      const tasks = searchService.queryTasks(input.q, filters, limit, offset)
      results.push(...tasks.map((task) => ({ entity: 'task', task })))
    }

    if (!filters?.entity || filters.entity === 'run') {
      const runs = searchService.queryRuns(input.q, filters, limit, offset)
      results.push(...runs.map((run) => ({ entity: 'run', run })))
    }

    if (!filters?.entity || filters.entity === 'artifact') {
      const artifacts = searchService.queryArtifacts(input.q, filters, limit, offset)
      results.push(...artifacts.map((artifact) => ({ entity: 'artifact', artifact })))
    }

    return SearchQueryResponseSchema.parse({ results })
  })
}
