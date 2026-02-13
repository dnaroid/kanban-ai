import { useEffect, useMemo, useState } from 'react'
import { Search } from 'lucide-react'
import type { SearchResult } from '@shared/types/ipc'

interface SearchModalProps {
  isOpen: boolean
  onClose: () => void
  activeProject: { id: string; name: string } | null
  onNavigate: (projectId: string) => void
}

export function SearchModal({ isOpen, onClose, activeProject, onNavigate }: SearchModalProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<SearchResult[]>([])
  const [isSearchLoading, setIsSearchLoading] = useState(false)

  // Filter states
  const [searchEntity, setSearchEntity] = useState<'all' | 'task' | 'run' | 'artifact'>('all')
  const [searchStatus, setSearchStatus] = useState<
    'all' | 'queued' | 'running' | 'question' | 'paused' | 'done' | 'failed'
  >('all')
  const [searchPriority, setSearchPriority] = useState<
    'all' | 'postpone' | 'low' | 'normal' | 'urgent'
  >('all')
  const [searchRole, setSearchRole] = useState('')
  const [searchTags, setSearchTags] = useState('')
  const [searchDateFrom, setSearchDateFrom] = useState('')
  const [searchDateTo, setSearchDateTo] = useState('')
  const [searchProjectScope, setSearchProjectScope] = useState<'all' | 'active'>('active')

  const searchFilters = useMemo(
    () => ({
      projectId: searchProjectScope === 'active' ? activeProject?.id : undefined,
      entity: searchEntity === 'all' ? undefined : searchEntity,
      status: searchStatus === 'all' ? undefined : searchStatus,
      priority: searchPriority === 'all' ? undefined : searchPriority,
      role: searchRole.trim() || undefined,
      tags: searchTags.trim()
        ? searchTags
            .split(',')
            .map((tag) => tag.trim())
            .filter(Boolean)
        : undefined,
      dateFrom: searchDateFrom || undefined,
      dateTo: searchDateTo || undefined,
    }),
    [
      searchProjectScope,
      activeProject,
      searchEntity,
      searchStatus,
      searchPriority,
      searchRole,
      searchTags,
      searchDateFrom,
      searchDateTo,
    ]
  )

  useEffect(() => {
    if (!isOpen) return
    const query = searchQuery.trim()
    if (!query) {
      setSearchResults([])
      return
    }

    const timeout = window.setTimeout(async () => {
      setIsSearchLoading(true)
      try {
        const response = await window.api.search.query({ q: query, filters: searchFilters })
        setSearchResults(response.results)
      } catch (error) {
        console.error('Failed to search:', error)
        setSearchResults([])
      } finally {
        setIsSearchLoading(false)
      }
    }, 200)

    return () => window.clearTimeout(timeout)
  }, [searchQuery, searchFilters, isOpen])

  // Reset search when closed
  useEffect(() => {
    if (!isOpen) {
      setSearchQuery('')
      setSearchResults([])
    }
  }, [isOpen])

  const isTaskResult = (
    result: SearchResult
  ): result is Extract<SearchResult, { entity: 'task' }> => result.entity === 'task'
  const isRunResult = (result: SearchResult): result is Extract<SearchResult, { entity: 'run' }> =>
    result.entity === 'run'
  const isArtifactResult = (
    result: SearchResult
  ): result is Extract<SearchResult, { entity: 'artifact' }> => result.entity === 'artifact'

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-start justify-center pt-24">
      <div className="w-[720px] bg-[#0B0E14] border border-slate-800/60 rounded-2xl shadow-2xl p-6 space-y-4">
        <div className="flex items-center gap-3">
          <Search className="w-4 h-4 text-slate-500" />
          <input
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Search tasks, runs, artifacts"
            autoFocus
            className="flex-1 bg-transparent text-sm text-slate-100 focus:outline-none"
          />
          <button onClick={onClose} className="text-xs text-slate-500 hover:text-slate-300">
            Esc
          </button>
        </div>

        <div className="flex flex-wrap gap-3">
          <select
            value={searchProjectScope}
            onChange={(event) => setSearchProjectScope(event.target.value as 'all' | 'active')}
            className="bg-[#0B0E14] border border-slate-700/60 text-xs text-slate-200 rounded-lg px-2 py-1"
          >
            <option value="active">Active project</option>
            <option value="all">All projects</option>
          </select>
          <select
            value={searchEntity}
            onChange={(event) =>
              setSearchEntity(event.target.value as 'all' | 'task' | 'run' | 'artifact')
            }
            className="bg-[#0B0E14] border border-slate-700/60 text-xs text-slate-200 rounded-lg px-2 py-1"
          >
            <option value="all">All entities</option>
            <option value="task">Tasks</option>
            <option value="run">Runs</option>
            <option value="artifact">Artifacts</option>
          </select>
          <select
            value={searchStatus}
            onChange={(event) =>
              setSearchStatus(
                event.target.value as
                  | 'all'
                  | 'queued'
                  | 'running'
                  | 'question'
                  | 'paused'
                  | 'done'
                  | 'failed'
              )
            }
            className="bg-[#0B0E14] border border-slate-700/60 text-xs text-slate-200 rounded-lg px-2 py-1"
          >
            <option value="all">All statuses</option>
            <option value="queued">Queued</option>
            <option value="running">Running</option>
            <option value="question">Question</option>
            <option value="paused">Paused</option>
            <option value="done">Done</option>
            <option value="failed">Failed</option>
          </select>
          <select
            value={searchPriority}
            onChange={(event) =>
              setSearchPriority(
                event.target.value as 'all' | 'postpone' | 'low' | 'normal' | 'urgent'
              )
            }
            className="bg-[#0B0E14] border border-slate-700/60 text-xs text-slate-200 rounded-lg px-2 py-1"
          >
            <option value="all">All priorities</option>
            <option value="postpone">Postpone</option>
            <option value="low">Low</option>
            <option value="normal">Normal</option>
            <option value="urgent">Urgent</option>
          </select>
          <input
            value={searchRole}
            onChange={(event) => setSearchRole(event.target.value)}
            placeholder="Role"
            className="bg-[#0B0E14] border border-slate-700/60 text-xs text-slate-200 rounded-lg px-2 py-1"
          />
          <input
            value={searchTags}
            onChange={(event) => setSearchTags(event.target.value)}
            placeholder="Tags (comma)"
            className="bg-[#0B0E14] border border-slate-700/60 text-xs text-slate-200 rounded-lg px-2 py-1"
          />
          <input
            type="date"
            value={searchDateFrom}
            onChange={(event) => setSearchDateFrom(event.target.value)}
            className="bg-[#0B0E14] border border-slate-700/60 text-xs text-slate-200 rounded-lg px-2 py-1"
          />
          <input
            type="date"
            value={searchDateTo}
            onChange={(event) => setSearchDateTo(event.target.value)}
            className="bg-[#0B0E14] border border-slate-700/60 text-xs text-slate-200 rounded-lg px-2 py-1"
          />
        </div>

        <div className="border-t border-slate-800/60 pt-4 space-y-4 max-h-[420px] overflow-auto">
          {isSearchLoading && <div className="text-xs text-slate-500">Searching...</div>}
          {!isSearchLoading && searchResults.length === 0 && searchQuery.trim() && (
            <div className="text-xs text-slate-500">No results.</div>
          )}

          {searchResults.some((result) => result.entity === 'task') && (
            <div className="space-y-2">
              <div className="text-[11px] uppercase tracking-wider text-slate-500 font-semibold">
                Tasks
              </div>
              {searchResults.filter(isTaskResult).map((result) => (
                <button
                  key={`task-${result.task.id}`}
                  onClick={() => onNavigate(result.task.projectId)}
                  className="w-full text-left bg-slate-900/40 border border-slate-800/60 rounded-xl px-4 py-3 hover:bg-slate-800/60"
                >
                  <div className="text-sm font-semibold text-slate-100 truncate">
                    {result.task.title}
                  </div>
                  <div className="text-[11px] text-slate-500 mt-1">
                    {result.task.status} • {result.task.priority}
                  </div>
                </button>
              ))}
            </div>
          )}

          {searchResults.some((result) => result.entity === 'run') && (
            <div className="space-y-2">
              <div className="text-[11px] uppercase tracking-wider text-slate-500 font-semibold">
                Runs
              </div>
              {searchResults.filter(isRunResult).map((result) => (
                <button
                  key={`run-${result.run.id}`}
                  onClick={() => onNavigate(result.run.projectId)}
                  className="w-full text-left bg-slate-900/40 border border-slate-800/60 rounded-xl px-4 py-3 hover:bg-slate-800/60"
                >
                  <div className="text-sm font-semibold text-slate-100 truncate">
                    {result.run.roleId} • {result.run.status}
                  </div>
                  <div className="text-[11px] text-slate-500 mt-1 truncate">
                    {result.run.errorText || 'No errors'}
                  </div>
                </button>
              ))}
            </div>
          )}

          {searchResults.some((result) => result.entity === 'artifact') && (
            <div className="space-y-2">
              <div className="text-[11px] uppercase tracking-wider text-slate-500 font-semibold">
                Artifacts
              </div>
              {searchResults.filter(isArtifactResult).map((result) => (
                <button
                  key={`artifact-${result.artifact.id}`}
                  onClick={() => onNavigate(result.artifact.projectId)}
                  className="w-full text-left bg-slate-900/40 border border-slate-800/60 rounded-xl px-4 py-3 hover:bg-slate-800/60"
                >
                  <div className="text-sm font-semibold text-slate-100 truncate">
                    {result.artifact.title}
                  </div>
                  <div className="text-[11px] text-slate-500 mt-1">{result.artifact.kind}</div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
