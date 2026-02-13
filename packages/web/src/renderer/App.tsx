import { useEffect, useRef, useState } from 'react'
import { ChevronRight, Search } from 'lucide-react'
import { ProjectsScreen } from './screens/ProjectsScreen'
import { DiagnosticsScreen } from './screens/DiagnosticsScreen'
import { BoardScreen } from './screens/BoardScreen'
import { TimelineScreen } from './screens/TimelineScreen'
import { SettingsScreen } from './screens/SettingsScreen'
import { cn } from './lib/utils'
import { Sidebar } from './components/Sidebar'
import { SearchModal } from './components/SearchModal'
import type { Screen } from './types/screen'

export default function App() {
  const [screen, setScreen] = useState<Screen>({ id: 'projects' })
  const [activeProject, setActiveProject] = useState<{ id: string; name: string } | null>(null)
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false)
  const [isSearchOpen, setIsSearchOpen] = useState(false)
  const isFirstRender = useRef(true)

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false
      return
    }

    const saveSidebarState = async () => {
      try {
        await window.api.appSetting.setSidebarCollapsed({ collapsed: isSidebarCollapsed })
      } catch (error) {
        console.error('Failed to save sidebar state:', error)
      }
    }

    void saveSidebarState()
  }, [isSidebarCollapsed])

  const openProjectBoard = (projectId: string) => {
    const name = activeProject?.id === projectId ? activeProject.name : projectId
    setScreen({ id: 'board', projectId, projectName: name })
    setIsSearchOpen(false)
  }

  return (
    <div
      className="h-screen bg-[#0B0E14] text-slate-200 font-sans selection:bg-blue-500/30 overflow-hidden"
      style={{ '--sidebar-width': isSidebarCollapsed ? '64px' : '256px' } as React.CSSProperties}
    >
      <Sidebar
        isSidebarCollapsed={isSidebarCollapsed}
        onToggleSidebar={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
        screen={screen}
        onScreenChange={setScreen}
        activeProject={activeProject}
      />

      {/* Main Content Area */}
      <main
        className={`h-screen flex flex-col transition-all duration-300 ${isSidebarCollapsed ? 'pl-16' : 'pl-64'}`}
      >
        <header className="h-16 border-b border-slate-800/30 bg-[#0B0E14]/80 backdrop-blur-md sticky top-0 z-40 flex items-center px-8 justify-between shrink-0">
          <div className="flex items-center gap-2 text-sm text-slate-500">
            {screen.id === 'settings' ? (
              <span className="text-slate-300 font-medium">Settings</span>
            ) : (
              <>
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
              </>
            )}
          </div>
          <div className="flex items-center gap-4">
            <div className="relative">
              <Search className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
              <input
                type="text"
                readOnly
                onFocus={() => setIsSearchOpen(true)}
                placeholder="Search..."
                className="w-64 bg-slate-900/60 border border-slate-800/60 text-xs text-slate-200 rounded-lg pl-9 pr-10 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500/20 cursor-pointer"
              />
              <span className="absolute right-3 top-2 text-[10px] text-slate-600 font-semibold pointer-events-none">
                {navigator.platform.toLowerCase().includes('mac') ? '⌘K' : 'Ctrl+K'}
              </span>
            </div>
          </div>
        </header>

        <div
          className={cn(
            'flex-1 overflow-hidden flex flex-col',
            screen.id !== 'board' && (screen.id === 'settings' ? 'px-8 pb-8 pt-2' : 'p-8')
          )}
        >
          {screen.id === 'projects' && (
            <ProjectsScreen
              onProjectSelect={(id, name) => {
                setActiveProject({ id, name })
                setScreen({ id: 'board', projectId: id, projectName: name })
              }}
            />
          )}
          {screen.id === 'diagnostics' && <DiagnosticsScreen />}
          {screen.id === 'board' && (
            <BoardScreen projectId={screen.projectId} projectName={screen.projectName} />
          )}

          {screen.id === 'timeline' && (
            <TimelineScreen projectId={screen.projectId} projectName={screen.projectName} />
          )}
          {screen.id === 'settings' && (
            <SettingsScreen
              projectId={activeProject?.id}
              projectName={activeProject?.name}
              onProjectDeleted={() => {
                setActiveProject(null)
                setScreen({ id: 'settings' })
              }}
            />
          )}
        </div>
      </main>

      <SearchModal
        isOpen={isSearchOpen}
        onClose={() => setIsSearchOpen(false)}
        activeProject={activeProject}
        onNavigate={openProjectBoard}
      />
    </div>
  )
}
