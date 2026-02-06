import { useEffect, useState } from 'react'
import { Globe, Trash2, Tag as TagIcon, Cpu } from 'lucide-react'
import { TagManagement } from '../components/settings/TagManagement'
import { BackupAndRestoreSettings } from '../components/settings/BackupAndRestoreSettings'
import { DangerZoneSettings } from '../components/settings/DangerZoneSettings'
import { ModelsManagement } from '../components/settings/ModelsManagement'
import { cn } from '../lib/utils'

type SettingsScreenProps = {
  projectId?: string
  projectName?: string
  onProjectDeleted: () => void
}

type Tab = 'migration' | 'tags' | 'danger' | 'models'

export function SettingsScreen({ projectId, projectName, onProjectDeleted }: SettingsScreenProps) {
  const [projects, setProjects] = useState<Array<{ id: string; name: string }>>([])
  const [activeTab, setActiveTab] = useState<Tab>('models')
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
    { id: 'models', label: 'Models', icon: Cpu },
    { id: 'tags', label: 'Taxonomy', icon: TagIcon },
    { id: 'migration', label: 'Data Management', icon: Globe },
    { id: 'danger', label: 'Danger Zone', icon: Trash2 },
  ]

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
        {activeTab === 'models' && <ModelsManagement onStatusChange={setStatus} />}
        <div
          className={cn(
            'flex-1 overflow-y-auto pb-20 custom-scrollbar',
            activeTab === 'models' && 'hidden'
          )}
        >
          {activeTab === 'tags' && <TagManagement />}
          {activeTab === 'migration' && (
            <BackupAndRestoreSettings
              projects={projects}
              currentProjectId={projectId}
              onStatusChange={setStatus}
            />
          )}
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
