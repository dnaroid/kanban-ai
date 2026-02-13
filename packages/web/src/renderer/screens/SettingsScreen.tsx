import { useEffect, useState } from 'react'
import { Trash2, Tag as TagIcon, Cpu, CheckCircle2, Settings2 } from 'lucide-react'
import { TagManagement } from '../components/settings/TagManagement'
import { DangerZoneSettings } from '../components/settings/DangerZoneSettings'
import { ModelsManagement } from '../components/settings/ModelsManagement'
import { cn } from '../lib/utils'

type SettingsScreenProps = {
  projectId?: string
  projectName?: string
  onProjectDeleted: () => void
}

type Tab = 'all-models' | 'my-models' | 'oh-my-opencode' | 'tags' | 'danger'

export function SettingsScreen({ projectId, projectName, onProjectDeleted }: SettingsScreenProps) {
  const [projects, setProjects] = useState<Array<{ id: string; name: string }>>([])
  const [activeTab, setActiveTab] = useState<Tab>('all-models')
  const [status, setStatus] = useState<{
    message: string
    type: 'info' | 'error' | 'success'
  } | null>(null)

  useEffect(() => {
    const loadProjects = async () => {
      try {
        const list = await window.api.project.getAll()
        setProjects(list)
      } catch (error) {
        console.error('Failed to load projects:', error)
      }
    }

    loadProjects()
  }, [])

  useEffect(() => {
    if (status) {
      const timer = setTimeout(() => setStatus(null), 5000)
      return () => clearTimeout(timer)
    }
    return undefined
  }, [status])

  const tabs: { id: Tab; label: string; icon: any }[] = [
    { id: 'all-models', label: 'All Models', icon: Cpu },
    { id: 'my-models', label: 'My Models', icon: CheckCircle2 },
    { id: 'oh-my-opencode', label: 'Oh-My-OpenCode', icon: Settings2 },
    { id: 'tags', label: 'Taxonomy', icon: TagIcon },
    { id: 'danger', label: 'Danger Zone', icon: Trash2 },
  ]

  const isModelTab =
    activeTab === 'all-models' || activeTab === 'my-models' || activeTab === 'oh-my-opencode'

  return (
    <div className="flex flex-col h-full w-full">
      {status && (
        <div className="fixed top-20 right-8 z-50">
          <div
            className={cn(
              'px-5 py-3 rounded-2xl border backdrop-blur-xl animate-in slide-in-from-top-4 shadow-2xl',
              status.type === 'success'
                ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                : status.type === 'error'
                  ? 'bg-red-500/10 border-red-500/20 text-red-400'
                  : 'bg-blue-500/10 border-blue-500/20 text-blue-400'
            )}
          >
            <div className="flex items-center gap-3">
              <div
                className={cn(
                  'w-2 h-2 rounded-full animate-pulse',
                  status.type === 'success'
                    ? 'bg-emerald-500'
                    : status.type === 'error'
                      ? 'bg-red-500'
                      : 'bg-blue-500'
                )}
              />
              <p className="text-sm font-bold tracking-tight">{status.message}</p>
            </div>
          </div>
        </div>
      )}

      <div className="flex items-center gap-2 mb-4 border-b border-slate-800/40">
        {tabs.map((tab) => {
          const Icon = tab.icon
          const isActive = activeTab === tab.id
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                'flex items-center gap-2 px-4 py-1.5 text-xs font-bold uppercase tracking-widest rounded-t-xl transition-all border-b-2 focus:outline-none',
                isActive
                  ? 'border-blue-500 text-blue-400 bg-blue-500/5'
                  : 'border-transparent text-slate-500 hover:text-slate-300 hover:bg-slate-800/20'
              )}
            >
              <Icon className={cn('w-4 h-4', isActive ? 'text-blue-400' : 'text-slate-500')} />
              {tab.label}
            </button>
          )
        })}
      </div>

      <div className="flex-1 flex flex-col overflow-hidden">
        {isModelTab && (
          <ModelsManagement
            activeSubTab={
              activeTab === 'all-models'
                ? 'all'
                : activeTab === 'my-models'
                  ? 'my'
                  : 'oh-my-opencode'
            }
            onStatusChange={setStatus}
          />
        )}
        <div
          className={cn(
            'flex-1 overflow-y-auto pb-20 custom-scrollbar',
            isModelTab && 'hidden'
          )}
        >
          {activeTab === 'tags' && <TagManagement />}
          {activeTab === 'danger' && (
            <DangerZoneSettings
              projects={projects}
              currentProjectId={projectId}
              currentProjectName={projectName}
              onStatusChange={setStatus}
              onProjectDeleted={onProjectDeleted}
            />
          )}
        </div>
      </div>
    </div>
  )
}
