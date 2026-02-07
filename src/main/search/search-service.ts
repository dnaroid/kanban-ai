import type { SearchFilters } from '../../shared/types/ipc'
import { artifactsSearchService } from './artifacts-search.service.js'
import { runsSearchService } from './runs-search.service.js'
import { tasksSearchService } from './tasks-search.service.js'

export const searchService = {
  queryTasks(query: string, filters?: SearchFilters, limit = 50, offset = 0) {
    return tasksSearchService.query(query, filters, limit, offset)
  },

  queryRuns(query: string, filters?: SearchFilters, limit = 50, offset = 0) {
    return runsSearchService.query(query, filters, limit, offset)
  },

  queryArtifacts(query: string, filters?: SearchFilters, limit = 50, offset = 0) {
    return artifactsSearchService.query(query, filters, limit, offset)
  },
}
