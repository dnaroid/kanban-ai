import { type ComponentType, useEffect, useState } from 'react'
import { Download, Globe, Trash2, Upload, Database, Settings2, AlertCircle } from 'lucide-react'
import { TagManagement } from '../components/settings/TagManagement'
import { cn } from '../lib/utils'

type SettingsScreenProps = {
  projectId?: string
  projectName?: string
  onProjectDeleted: () => void
}

export function SettingsScreen({ projectId, projectName, onProjectDeleted }: SettingsScreenProps) {
  const [projects, setProjects] = useState<Array<{ id: string; name: string }>>([])
  const [selectedProjectId, setSelectedProjectId] = useState('')
  const [exportPath, setExportPath] = useState('')
  const [importPath, setImportPath] = useState('')
  const [importMode, setImportMode] = useState<'new' | 'overwrite'>('new')
  const [importProjectPath, setImportProjectPath] = useState('')
  const [status, setStatus] = useState<{
    message: string
    type: 'info' | 'error' | 'success'
  } | null>(null)
  const [isExporting, setIsExporting] = useState(false)
  const [isImporting, setIsImporting] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [isDbDeleting, setIsDbDeleting] = useState(false)
  const [showDbDeleteConfirm, setShowDbDeleteConfirm] = useState(false)

  useEffect(() => {
    setSelectedProjectId(projectId ?? '')
  }, [projectId])

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

  const handleExport = async () => {
    if (!exportPath.trim()) return
    const exportProjectId = selectedProjectId || projectId
    if (!exportProjectId) {
      setStatus({ message: 'Select a project first.', type: 'error' })
      return
    }
    setIsExporting(true)
    setStatus(null)
    try {
      const result = await window.api.backup.exportProject({
        projectId: exportProjectId,
        toPath: exportPath.trim(),
      })
      setStatus({ message: `Exported to ${result.path}`, type: 'success' })
    } catch (error) {
      console.error('Export failed:', error)
      setStatus({ message: 'Export failed. Check path and try again.', type: 'error' })
    } finally {
      setIsExporting(false)
    }
  }

  const handleImport = async () => {
    if (!importPath.trim()) return
    if (importMode === 'new' && !importProjectPath.trim()) {
      setStatus({ message: 'Project path is required for new import.', type: 'error' })
      return
    }
    setIsImporting(true)
    setStatus(null)
    try {
      const result = await window.api.backup.importProject({
        zipPath: importPath.trim(),
        mode: importMode,
        projectPath: importMode === 'new' ? importProjectPath.trim() : undefined,
      })
      setStatus({
        message: result.projectId ? `Imported project ${result.projectId}` : 'Import complete',
        type: 'success',
      })
    } catch (error) {
      console.error('Import failed:', error)
      setStatus({ message: 'Import failed. Check zip and settings.', type: 'error' })
    } finally {
      setIsImporting(false)
    }
  }

  const handleDeleteProject = async () => {
    const deleteProjectId = selectedProjectId || projectId
    if (!deleteProjectId) {
      setStatus({ message: 'Select a project first.', type: 'error' })
      return
    }
    setIsDeleting(true)
    setStatus(null)
    try {
      await window.api.project.delete({ id: deleteProjectId })
      setStatus({ message: 'Project deleted successfully', type: 'success' })
      onProjectDeleted()
    } catch (error) {
      console.error('Delete failed:', error)
      setStatus({ message: 'Delete failed. Try again.', type: 'error' })
    } finally {
      setIsDeleting(false)
      setShowDeleteConfirm(false)
    }
  }

  const handleDeleteDatabase = async () => {
    setIsDbDeleting(true)
    setStatus(null)
    try {
      await window.api.database.delete({})
      setStatus({ message: 'Database reset successfully', type: 'success' })
    } catch (error) {
      console.error('Database delete failed:', error)
      setStatus({ message: 'Database reset failed.', type: 'error' })
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

  const InputField = ({ label, value, onChange, placeholder, description }: any) => (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between pl-1">
        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
          {label}
        </label>
        {description && (
          <span className="text-[9px] text-slate-600 font-medium">{description}</span>
        )}
      </div>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full bg-[#0B0E14] border border-slate-800/60 text-sm text-slate-200 rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500/40 transition-all placeholder:text-slate-800"
      />
    </div>
  )

  const activeProjectName = projects.find((p) => p.id === selectedProjectId)?.name || projectName

  return (
    <div className="flex flex-col h-full max-w-6xl mx-auto w-full px-6">
      <header className="flex items-center justify-between py-6 shrink-0 border-b border-slate-800/50 mb-8">
        <div>
          <div className="flex items-center gap-2.5 mb-1">
            <div className="p-1.5 bg-blue-600 rounded-lg">
              <Settings2 className="w-4 h-4 text-white" />
            </div>
            <h2 className="text-2xl font-bold text-white tracking-tight">Settings</h2>
          </div>
          <p className="text-slate-500 text-sm">Configure your workspace and data integrity</p>
        </div>

        {status && (
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
        )}
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 overflow-y-auto pr-2 pb-20 custom-scrollbar">
        <div className="space-y-6">
          <section className="bg-[#11151C] border border-slate-800/50 rounded-2xl p-6 shadow-xl">
            <SectionHeader
              icon={Globe}
              title="Migration"
              subtitle="Import and restore system state"
              variant="blue"
            />

            <div className="space-y-6">
              <InputField
                label="Import Project"
                value={importPath}
                onChange={setImportPath}
                placeholder="/absolute/path/to/archive.zip"
                description="ZIP archive"
              />

              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-400 uppercase tracking-widest block pl-1">
                  Operation Mode
                </label>
                <div className="grid grid-cols-2 gap-1.5 p-1 bg-[#0B0E14] border border-slate-800/60 rounded-xl">
                  {(['new', 'overwrite'] as const).map((mode) => (
                    <button
                      key={mode}
                      onClick={() => setImportMode(mode)}
                      className={cn(
                        'px-3 py-2 text-xs font-bold rounded-lg transition-all duration-200',
                        importMode === mode
                          ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20'
                          : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800/40'
                      )}
                    >
                      {mode === 'new' ? 'New Project' : 'Overwrite All'}
                    </button>
                  ))}
                </div>
              </div>

              {importMode === 'new' && (
                <div className="animate-in fade-in slide-in-from-top-2 duration-300">
                  <InputField
                    label="Local Repo Path"
                    value={importProjectPath}
                    onChange={setImportProjectPath}
                    placeholder="/path/to/repository"
                  />
                </div>
              )}

              <button
                onClick={handleImport}
                disabled={isImporting || !importPath.trim()}
                className="group relative w-full overflow-hidden py-3 text-xs font-black uppercase tracking-widest rounded-xl bg-blue-600 text-white hover:bg-blue-500 disabled:bg-slate-800 disabled:text-slate-600 disabled:shadow-none transition-all duration-300 shadow-xl shadow-blue-600/20"
              >
                <div className="relative z-10 flex items-center justify-center gap-2">
                  <Upload className="w-4 h-4" />
                  {isImporting ? 'Processing...' : 'Run Import'}
                </div>
              </button>

              <div className="pt-6 border-t border-slate-800/40 space-y-6">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-slate-800/40 flex items-center justify-center ring-1 ring-slate-700/50">
                    <Download className="w-4 h-4 text-slate-400" />
                  </div>
                  <h4 className="text-xs font-bold text-white uppercase tracking-widest">Backup</h4>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block pl-1">
                    Source Project
                  </label>
                  <select
                    value={selectedProjectId}
                    onChange={(event) => setSelectedProjectId(event.target.value)}
                    className="w-full bg-[#0B0E14] border border-slate-800/60 text-sm text-slate-200 rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500/40 transition-all appearance-none"
                  >
                    <option value="">Select project...</option>
                    {projects.map((project) => (
                      <option key={project.id} value={project.id}>
                        {project.name}
                      </option>
                    ))}
                  </select>
                </div>

                <InputField
                  label="Destination"
                  value={exportPath}
                  onChange={setExportPath}
                  placeholder="/path/to/backup.zip"
                />

                <button
                  onClick={handleExport}
                  disabled={isExporting || !exportPath.trim() || !selectedProjectId}
                  className="w-full py-3 text-xs font-black uppercase tracking-widest rounded-xl border border-slate-800 hover:border-blue-500/50 hover:bg-blue-500/5 text-blue-400 disabled:border-slate-900 disabled:text-slate-700 transition-all duration-300"
                >
                  {isExporting ? 'Packaging...' : 'Create Backup'}
                </button>
              </div>
            </div>
          </section>
        </div>

        <div className="space-y-6">
          <TagManagement />

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
                        className="w-full md:w-auto px-6 py-2.5 text-xs font-black uppercase tracking-widest rounded-xl border border-red-900/40 text-red-500 hover:bg-red-500 hover:text-white transition-all duration-300 disabled:opacity-20"
                      >
                        Delete Project
                      </button>
                    ) : (
                      <div className="flex gap-3 animate-in zoom-in-95 duration-200">
                        <button
                          onClick={handleDeleteProject}
                          disabled={isDeleting}
                          className="px-5 py-2.5 text-xs font-black uppercase tracking-widest rounded-xl bg-red-600 text-white hover:bg-red-500 shadow-xl shadow-red-600/20 transition-all"
                        >
                          {isDeleting ? 'Deleting...' : 'Confirm'}
                        </button>
                        <button
                          onClick={() => setShowDeleteConfirm(false)}
                          className="px-5 py-2.5 text-xs font-black uppercase tracking-widest rounded-xl bg-slate-900 text-slate-400 hover:bg-slate-800 transition-all"
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
                        className="w-full md:w-auto px-6 py-2.5 text-xs font-black uppercase tracking-widest rounded-xl border border-red-900/40 text-red-500 hover:bg-red-500 hover:text-white transition-all duration-300"
                      >
                        Wipe Database
                      </button>
                    ) : (
                      <div className="flex gap-3 animate-in zoom-in-95 duration-200">
                        <button
                          onClick={handleDeleteDatabase}
                          disabled={isDbDeleting}
                          className="px-5 py-2.5 text-xs font-black uppercase tracking-widest rounded-xl bg-red-600 text-white hover:bg-red-500 shadow-xl shadow-red-600/20 transition-all"
                        >
                          {isDbDeleting ? 'Purging...' : 'Confirm'}
                        </button>
                        <button
                          onClick={() => setShowDbDeleteConfirm(false)}
                          className="px-5 py-2.5 text-xs font-black uppercase tracking-widest rounded-xl bg-slate-900 text-slate-400 hover:bg-slate-800 transition-all"
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
      </div>
    </div>
  )
}
