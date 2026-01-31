import { useEffect, useMemo, useState } from 'react'
import {
  Activity,
  AlertTriangle,
  BarChart3,
  CalendarRange,
  ChevronLeft,
  ChevronRight,
  FolderKanban,
  Layout,
  Search,
  Settings,
} from 'lucide-react'
import { ProjectsScreen } from './screens/ProjectsScreen'
import { DiagnosticsScreen } from './screens/DiagnosticsScreen'
import { BoardScreen } from './screens/BoardScreen'

import { TimelineScreen } from './screens/TimelineScreen'
import { AnalyticsScreen } from './screens/AnalyticsScreen'
import { SettingsScreen } from './screens/SettingsScreen'
import { cn } from './lib/utils'
import type { SearchResult } from '../shared/types/ipc'

type Screen =
  | { id: 'projects' }
  | { id: 'diagnostics' }
  | { id: 'board'; projectId: string; projectName: string }
  | { id: 'timeline'; projectId: string; projectName: string }
  | { id: 'analytics'; projectId: string; projectName: string }
  | { id: 'settings'; projectId: string; projectName: string }

export default function App() {
  const [screen, setScreen] = useState<Screen>({ id: 'projects' })
  const [activeProject, setActiveProject] = useState<{ id: string; name: string } | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false)
  const [searchResults, setSearchResults] = useState<SearchResult[]>([])
  const [isSearchOpen, setIsSearchOpen] = useState(false)
  const [isSearchLoading, setIsSearchLoading] = useState(false)
  const [searchEntity, setSearchEntity] = useState<'all' | 'task' | 'run' | 'artifact'>('all')
  const [searchStatus, setSearchStatus] = useState<'all' | 'todo' | 'in-progress' | 'done'>('all')
  const [searchPriority, setSearchPriority] = useState<
    'all' | 'low' | 'medium' | 'high' | 'urgent'
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
    const handleKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setIsSearchOpen(true)
      }
      if (event.key === 'Escape') {
        setIsSearchOpen(false)
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [])

  useEffect(() => {
    const loadLastProject = async () => {
      try {
        const { projectId } = await window.api.appSetting.getLastProjectId()
        if (projectId) {
          const project = await window.api.project.getById(projectId)
          if (project) {
            setActiveProject({ id: project.id, name: project.name })
            setScreen({ id: 'board', projectId: project.id, projectName: project.name })
          }
        }
      } catch (error) {
        console.error('Failed to load last project:', error)
      }
    }

    loadLastProject()
  }, [])

  useEffect(() => {
    const loadSidebarState = async () => {
      try {
        const { collapsed } = await window.api.appSetting.getSidebarCollapsed()
        setIsSidebarCollapsed(collapsed)
      } catch (error) {
        console.error('Failed to load sidebar state:', error)
      }
    }

    loadSidebarState()
  }, [])

  useEffect(() => {
    const saveSidebarState = async () => {
      try {
        await window.api.appSetting.setSidebarCollapsed({ collapsed: isSidebarCollapsed })
      } catch (error) {
        console.error('Failed to save sidebar state:', error)
      }
    }

    saveSidebarState()
  }, [isSidebarCollapsed])

  useEffect(() => {
    if (!isSearchOpen) return
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
  }, [searchQuery, searchFilters, isSearchOpen])

  const openProjectBoard = (projectId: string) => {
    const name = activeProject?.id === projectId ? activeProject.name : projectId
    setScreen({ id: 'board', projectId, projectName: name })
    setIsSearchOpen(false)
  }

  const isTaskResult = (
    result: SearchResult
  ): result is Extract<SearchResult, { entity: 'task' }> => result.entity === 'task'
  const isRunResult = (result: SearchResult): result is Extract<SearchResult, { entity: 'run' }> =>
    result.entity === 'run'
  const isArtifactResult = (
    result: SearchResult
  ): result is Extract<SearchResult, { entity: 'artifact' }> => result.entity === 'artifact'

  const navItems = [
    { id: 'projects' as const, label: 'Projects', icon: FolderKanban },
    { id: 'diagnostics' as const, label: 'Diagnostics', icon: Activity },
    { id: 'analytics' as const, label: 'Analytics', icon: BarChart3 },
    { id: 'timeline' as const, label: 'Timeline', icon: CalendarRange },
  ]
  return (
    <div className="min-h-screen bg-[#0B0E14] text-slate-200 font-sans selection:bg-blue-500/30">
      {/* Sidebar Navigation */}
      <aside
        className={`fixed top-0 left-0 h-full bg-[#11151C] border-r border-slate-800/50 flex flex-col z-50 transition-all duration-300 ${isSidebarCollapsed ? 'w-16' : 'w-64'}`}
      >
        <div
          className={cn(
            'flex items-center shrink-0 transition-all duration-300 ease-in-out border-b border-slate-800/50',
            isSidebarCollapsed ? 'flex-col justify-center gap-4 py-4' : 'justify-between px-6 py-5'
          )}
        >
          <div
            className={cn(
              'flex items-center',
              isSidebarCollapsed ? 'justify-center w-full' : 'gap-3'
            )}
          >
            <div className="w-8 h-8 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-lg flex items-center justify-center shadow-lg shadow-blue-500/20 shrink-0">
              <Layout className="w-5 h-5 text-white" />
            </div>
            {!isSidebarCollapsed && (
              <div className="flex flex-col animate-in fade-in duration-300">
                <span className="font-bold text-lg tracking-tight bg-gradient-to-r from-white to-slate-400 bg-clip-text text-transparent">
                  Kanban AI
                </span>
                <span className="text-[10px] text-slate-500 font-mono tracking-widest uppercase">
                  v1.0.0-beta
                </span>
              </div>
            )}
          </div>

          <button
            onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
            className={cn(
              'p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-all duration-200',
              isSidebarCollapsed ? '' : ''
            )}
          >
            {isSidebarCollapsed ? (
              <ChevronRight className="w-4 h-4" />
            ) : (
              <ChevronLeft className="w-4 h-4" />
            )}
          </button>
        </div>

        <nav className={`flex-1 ${isSidebarCollapsed ? 'p-2' : 'p-4'} space-y-1 mt-4`}>
          {navItems.map((item) => {
            const Icon = item.icon
            const isActive = screen.id === item.id
            const isDisabled =
              (item.id === 'timeline' && !activeProject) ||
              (item.id === 'analytics' && !activeProject)
            return (
              <button
                key={item.id}
                onClick={() => {
                  if (item.id === 'timeline' || item.id === 'analytics') {
                    if (!activeProject) return
                    setScreen({
                      id: item.id,
                      projectId: activeProject.id,
                      projectName: activeProject.name,
                    })
                    return
                  }
                  setScreen({ id: item.id })
                }}
                disabled={isDisabled}
                className={cn(
                  'flex items-center rounded-xl transition-all duration-200 group',
                  isSidebarCollapsed ? 'justify-center w-12 h-12' : 'gap-3 px-4 py-3 w-full',
                  isActive
                    ? 'bg-blue-600/10 text-blue-400 ring-1 ring-inset ring-blue-500/20'
                    : 'text-slate-400 hover:bg-slate-800/50 hover:text-slate-200',
                  isDisabled && 'opacity-50 cursor-not-allowed hover:bg-transparent'
                )}
                title={item.label}
              >
                <Icon
                  className={cn(
                    'transition-transform duration-200',
                    isSidebarCollapsed ? 'w-6 h-6' : 'w-5 h-5',
                    isActive ? 'text-blue-400' : 'text-slate-500 group-hover:text-slate-300'
                  )}
                />
                {!isSidebarCollapsed && <span className="font-medium">{item.label}</span>}
              </button>
            )
          })}
        </nav>

        <div className={`border-t border-slate-800/50 ${isSidebarCollapsed ? 'p-2' : 'p-4'}`}>
          <button
            onClick={() => {
              if (!activeProject) return
              setScreen({
                id: 'settings',
                projectId: activeProject.id,
                projectName: activeProject.name,
              })
            }}
            disabled={!activeProject}
            className={cn(
              'w-full flex items-center rounded-xl transition-all duration-200 group',
              isSidebarCollapsed ? 'justify-center w-12 h-12' : 'gap-3 px-4 py-3 w-full',
              'text-slate-500 hover:bg-slate-800/50 hover:text-slate-300',
              !activeProject && 'opacity-50 cursor-not-allowed hover:bg-transparent'
            )}
            title="Settings"
          >
            <Settings className="w-5 h-5" />
            {!isSidebarCollapsed && <span className="font-medium">Settings</span>}
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <main
        className={`min-h-screen flex flex-col transition-all duration-300 ${isSidebarCollapsed ? 'pl-16' : 'pl-64'}`}
      >
        <header className="h-16 border-b border-slate-800/30 bg-[#0B0E14]/80 backdrop-blur-md sticky top-0 z-40 flex items-center px-8 justify-between shrink-0">
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <button
              onClick={() => setScreen({ id: 'projects' })}
              className="hover:text-slate-300 transition-colors"
            >
              Projects
            </button>
            {screen.id === 'board' && (
              <>
                <ChevronRight className="w-4 h-4 text-slate-700" />
                <span className="text-slate-300 font-medium">{screen.projectName}</span>
              </>
            )}
            {screen.id === 'diagnostics' && (
              <>
                <ChevronRight className="w-4 h-4 text-slate-700" />
                <span className="text-slate-300 font-medium">Diagnostics</span>
              </>
            )}

            {screen.id === 'timeline' && (
              <>
                <ChevronRight className="w-4 h-4 text-slate-700" />
                <span className="text-slate-300 font-medium">{screen.projectName}</span>
                <ChevronRight className="w-4 h-4 text-slate-700" />
                <span className="text-slate-300 font-medium">Timeline</span>
              </>
            )}
            {screen.id === 'analytics' && (
              <>
                <ChevronRight className="w-4 h-4 text-slate-700" />
                <span className="text-slate-300 font-medium">{screen.projectName}</span>
                <ChevronRight className="w-4 h-4 text-slate-700" />
                <span className="text-slate-300 font-medium">Analytics</span>
              </>
            )}
            {screen.id === 'settings' && (
              <>
                <ChevronRight className="w-4 h-4 text-slate-700" />
                <span className="text-slate-300 font-medium">{screen.projectName}</span>
                <ChevronRight className="w-4 h-4 text-slate-700" />
                <span className="text-slate-300 font-medium">Settings</span>
              </>
            )}
          </div>
          <div className="flex items-center gap-4">
            <div className="relative">
              <Search className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
              <input
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                onFocus={() => setIsSearchOpen(true)}
                placeholder="Search..."
                className="w-64 bg-slate-900/60 border border-slate-800/60 text-xs text-slate-200 rounded-lg pl-9 pr-10 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              />
              <span className="absolute right-3 top-2 text-[10px] text-slate-600 font-semibold">
                {navigator.platform.toLowerCase().includes('mac') ? '⌘K' : 'Ctrl+K'}
              </span>
            </div>
            <div className="px-3 py-1 bg-amber-500/10 border border-amber-500/20 rounded-full flex items-center gap-2">
              <AlertTriangle className="w-3 h-3 text-amber-500" />
              <span className="text-[10px] text-amber-500 font-bold uppercase tracking-wider">
                Dev Mode
              </span>
            </div>
          </div>
        </header>

        <div className="flex-1 p-8 overflow-hidden flex flex-col">
          {screen.id === 'projects' && (
            <ProjectsScreen
              onProjectSelect={(id, name) => {
                setActiveProject({ id, name })
                setScreen({ id: 'board', projectId: id, projectName: name })
              }}
            />
          )}
          {screen.id === 'diagnostics' && <DiagnosticsScreen />}
          {screen.id === 'board' && <BoardScreen projectId={screen.projectId} />}

          {screen.id === 'timeline' && (
            <TimelineScreen projectId={screen.projectId} projectName={screen.projectName} />
          )}
          {screen.id === 'analytics' && (
            <AnalyticsScreen projectId={screen.projectId} projectName={screen.projectName} />
          )}
          {screen.id === 'settings' && (
            <SettingsScreen
              projectId={screen.projectId}
              projectName={screen.projectName}
              onProjectDeleted={() => {
                setActiveProject(null)
                setScreen({ id: 'projects' })
              }}
            />
          )}
        </div>
      </main>

      {isSearchOpen && (
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
              <button
                onClick={() => setIsSearchOpen(false)}
                className="text-xs text-slate-500 hover:text-slate-300"
              >
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
                  setSearchStatus(event.target.value as 'all' | 'todo' | 'in-progress' | 'done')
                }
                className="bg-[#0B0E14] border border-slate-700/60 text-xs text-slate-200 rounded-lg px-2 py-1"
              >
                <option value="all">All statuses</option>
                <option value="todo">Todo</option>
                <option value="in-progress">In progress</option>
                <option value="done">Done</option>
              </select>
              <select
                value={searchPriority}
                onChange={(event) =>
                  setSearchPriority(
                    event.target.value as 'all' | 'low' | 'medium' | 'high' | 'urgent'
                  )
                }
                className="bg-[#0B0E14] border border-slate-700/60 text-xs text-slate-200 rounded-lg px-2 py-1"
              >
                <option value="all">All priorities</option>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
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
                      onClick={() => openProjectBoard(result.task.projectId)}
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
                      onClick={() => openProjectBoard(result.run.projectId)}
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
                      onClick={() => openProjectBoard(result.artifact.projectId)}
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
      )}
    </div>
  )
}
