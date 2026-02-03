import { useState, type ComponentType } from 'react'
import { Trash2, Database, AlertCircle } from 'lucide-react'
import { cn } from '../../lib/utils'

type Status = {
  message: string
  type: 'info' | 'error' | 'success'
} | null

type DangerZoneSettingsProps = {
  projects: Array<{ id: string; name: string }>
  currentProjectId?: string
  currentProjectName?: string
  onStatusChange: (status: Status) => void
  onProjectDeleted: () => void
}

export function DangerZoneSettings({
  projects,
  currentProjectId,
  currentProjectName,
  onStatusChange,
  onProjectDeleted,
}: DangerZoneSettingsProps) {
  const [selectedProjectId, setSelectedProjectId] = useState(currentProjectId ?? '')
  const [isDeleting, setIsDeleting] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [isDbDeleting, setIsDbDeleting] = useState(false)
  const [showDbDeleteConfirm, setShowDbDeleteConfirm] = useState(false)

  const activeProjectName =
    projects.find((p) => p.id === selectedProjectId)?.name || currentProjectName

  const handleDeleteProject = async () => {
    const deleteProjectId = selectedProjectId || currentProjectId
    if (!deleteProjectId) {
      onStatusChange({ message: 'Select a project first.', type: 'error' })
      return
    }
    setIsDeleting(true)
    onStatusChange(null)
    try {
      await window.api.project.delete({ id: deleteProjectId })
      onStatusChange({ message: 'Project deleted successfully', type: 'success' })
      onProjectDeleted()
    } catch (error) {
      console.error('Delete failed:', error)
      onStatusChange({ message: 'Delete failed. Try again.', type: 'error' })
    } finally {
      setIsDeleting(false)
      setShowDeleteConfirm(false)
    }
  }

  const handleDeleteDatabase = async () => {
    setIsDbDeleting(true)
    onStatusChange(null)
    try {
      await window.api.database.delete({})
      onStatusChange({ message: 'Database reset successfully', type: 'success' })
    } catch (error) {
      console.error('Database delete failed:', error)
      onStatusChange({ message: 'Database reset failed.', type: 'error' })
    } finally {
      setIsDbDeleting(false)
      setShowDbDeleteConfirm(false)
    }
  }

  const SectionHeader = ({
    icon: Icon,
    title,
    subtitle,
    variant = 'blue',
  }: {
    icon: ComponentType<{ className?: string }>
    title: string
    subtitle?: string
    variant?: 'blue' | 'red' | 'slate'
  }) => {
    const variants = {
      blue: 'bg-blue-500/10 ring-blue-500/20 text-blue-400',
      red: 'bg-red-500/10 ring-red-500/20 text-red-400',
      slate: 'bg-slate-500/10 ring-slate-500/20 text-slate-400',
    }

    return (
      <div className="flex items-center gap-3 mb-6">
        <div
          className={cn(
            'w-10 h-10 rounded-xl flex items-center justify-center ring-1',
            variants[variant]
          )}
        >
          <Icon className="w-5 h-5" />
        </div>
        <div>
          <h3 className="text-lg font-bold text-white tracking-tight">{title}</h3>
          {subtitle && <p className="text-xs text-slate-500 font-medium">{subtitle}</p>}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <section className="bg-red-500/[0.01] border border-red-900/20 rounded-2xl p-6">
        <SectionHeader
          icon={Trash2}
          title="Danger Zone"
          subtitle="Permanent and irreversible actions"
          variant="red"
        />

        <div className="space-y-4">
          <div className="p-5 bg-[#0B0E14] border border-red-900/20 rounded-2xl group transition-all hover:border-red-900/40">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="space-y-3 flex-1">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-red-500/10 rounded-lg">
                    <AlertCircle className="w-4 h-4 text-red-400" />
                  </div>
                  <h5 className="text-xs font-bold text-red-200 uppercase tracking-widest">
                    Delete Project
                  </h5>
                </div>
                <p className="text-xs text-slate-500 leading-relaxed max-w-sm">
                  Remove all data for{' '}
                  <span className="text-red-400 font-bold">
                    {activeProjectName || 'this project'}
                  </span>
                  . This action cannot be undone.
                </p>
                <select
                  value={selectedProjectId}
                  onChange={(event) => setSelectedProjectId(event.target.value)}
                  className="w-full max-w-xs bg-[#0B0E14]/80 border border-red-900/30 text-sm text-red-200/80 rounded-xl px-4 py-2 focus:ring-2 focus:ring-red-500/20 transition-all appearance-none"
                >
                  <option value="">Select project to destroy</option>
                  {projects.map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="shrink-0">
                {!showDeleteConfirm ? (
                  <button
                    onClick={() => setShowDeleteConfirm(true)}
                    disabled={!selectedProjectId}
                    className="w-full md:w-auto px-6 py-2 text-xs font-semibold rounded-lg border border-red-900/40 text-red-500 hover:bg-red-500 hover:text-white transition-all duration-300 disabled:opacity-20"
                  >
                    Delete Project
                  </button>
                ) : (
                  <div className="flex gap-3 animate-in zoom-in-95 duration-200">
                    <button
                      onClick={handleDeleteProject}
                      disabled={isDeleting}
                      className="px-5 py-2 text-xs font-semibold rounded-lg bg-red-600 text-white hover:bg-red-500 shadow-xl shadow-red-600/20 transition-all"
                    >
                      {isDeleting ? 'Deleting...' : 'Confirm'}
                    </button>
                    <button
                      onClick={() => setShowDeleteConfirm(false)}
                      className="px-5 py-2 text-xs font-semibold rounded-lg bg-slate-900 text-slate-400 hover:bg-slate-800 transition-all"
                    >
                      Cancel
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="p-5 bg-[#0B0E14] border border-red-900/20 rounded-2xl group transition-all hover:border-red-900/40">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="space-y-3 flex-1">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-red-500/10 rounded-lg">
                    <Database className="w-4 h-4 text-red-400" />
                  </div>
                  <h5 className="text-xs font-bold text-red-200 uppercase tracking-widest">
                    Wipe System
                  </h5>
                </div>
                <p className="text-xs text-slate-500 leading-relaxed max-w-sm">
                  Factory reset the database. All projects, tags, and settings will be purged.
                </p>
              </div>

              <div className="shrink-0">
                {!showDbDeleteConfirm ? (
                  <button
                    onClick={() => setShowDbDeleteConfirm(true)}
                    className="w-full md:w-auto px-6 py-2 text-xs font-semibold rounded-lg border border-red-900/40 text-red-500 hover:bg-red-500 hover:text-white transition-all duration-300"
                  >
                    Wipe Database
                  </button>
                ) : (
                  <div className="flex gap-3 animate-in zoom-in-95 duration-200">
                    <button
                      onClick={handleDeleteDatabase}
                      disabled={isDbDeleting}
                      className="px-5 py-2 text-xs font-semibold rounded-lg bg-red-600 text-white hover:bg-red-500 shadow-xl shadow-red-600/20 transition-all"
                    >
                      {isDbDeleting ? 'Purging...' : 'Confirm'}
                    </button>
                    <button
                      onClick={() => setShowDbDeleteConfirm(false)}
                      className="px-5 py-2 text-xs font-semibold rounded-lg bg-slate-900 text-slate-400 hover:bg-slate-800 transition-all"
                    >
                      Cancel
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}
