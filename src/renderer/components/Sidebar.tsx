import {
  Activity,
  BarChart3,
  CalendarRange,
  ChevronLeft,
  ChevronRight,
  FolderKanban,
  Layout,
  Settings,
} from 'lucide-react'
import { cn } from '../lib/utils'
import type { Screen } from '../types/screen'

interface SidebarProps {
  isSidebarCollapsed: boolean
  onToggleSidebar: () => void
  screen: Screen
  onScreenChange: (screen: Screen) => void
  activeProject: { id: string; name: string } | null
}

export function Sidebar({
  isSidebarCollapsed,
  onToggleSidebar,
  screen,
  onScreenChange,
  activeProject,
}: SidebarProps) {
  const navItems = [
    { id: 'projects' as const, label: 'Projects', icon: FolderKanban },
    { id: 'diagnostics' as const, label: 'Diagnostics', icon: Activity },
    { id: 'analytics' as const, label: 'Analytics', icon: BarChart3 },
    { id: 'timeline' as const, label: 'Timeline', icon: CalendarRange },
  ]

  return (
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
          onClick={onToggleSidebar}
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
                  onScreenChange({
                    id: item.id,
                    projectId: activeProject.id,
                    projectName: activeProject.name,
                  })
                  return
                }
                onScreenChange({ id: item.id })
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
            onScreenChange({ id: 'settings' })
          }}
          className={cn(
            'w-full flex items-center rounded-xl transition-all duration-200 group',
            isSidebarCollapsed ? 'justify-center w-12 h-12' : 'gap-3 px-4 py-3 w-full',
            'text-slate-500 hover:bg-slate-800/50 hover:text-slate-300'
          )}
          title="Settings"
        >
          <Settings className="w-5 h-5" />
          {!isSidebarCollapsed && <span className="font-medium">Settings</span>}
        </button>
      </div>
    </aside>
  )
}
