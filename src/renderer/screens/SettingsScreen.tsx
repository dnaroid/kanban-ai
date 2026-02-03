import { type ComponentType, useEffect, useState } from 'react'
import { Download, Globe, Trash2, Upload } from 'lucide-react'
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
  const [status, setStatus] = useState<string | null>(null)
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

  const handleExport = async () => {
    if (!exportPath.trim()) return
    const exportProjectId = selectedProjectId || projectId
    if (!exportProjectId) {
      setStatus('Select a project first.')
      return
    }
    setIsExporting(true)
    setStatus(null)
    try {
      const result = await window.api.backup.exportProject({
        projectId: exportProjectId,
        toPath: exportPath.trim(),
      })
      setStatus(`Exported to ${result.path}`)
    } catch (error) {
      console.error('Export failed:', error)
      setStatus('Export failed. Check path and try again.')
    } finally {
      setIsExporting(false)
    }
  }

  const handleImport = async () => {
    if (!importPath.trim()) return
    if (importMode === 'new' && !importProjectPath.trim()) {
      setStatus('Project path is required for new import.')
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
      setStatus(result.projectId ? `Imported project ${result.projectId}` : 'Import complete')
    } catch (error) {
      console.error('Import failed:', error)
      setStatus('Import failed. Check zip and settings.')
    } finally {
      setIsImporting(false)
    }
  }

  const handleDeleteProject = async () => {
    const deleteProjectId = selectedProjectId || projectId
    if (!deleteProjectId) {
      setStatus('Select a project first.')
      return
    }
    setIsDeleting(true)
    setStatus(null)
    try {
      await window.api.project.delete({ id: deleteProjectId })
      setStatus('Project deleted successfully')
      onProjectDeleted()
    } catch (error) {
      console.error('Delete failed:', error)
      setStatus('Delete failed. Try again.')
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
      setStatus('Database reset successfully')
    } catch (error) {
      console.error('Database delete failed:', error)
      setStatus('Database reset failed.')
    } finally {
      setIsDbDeleting(false)
      setShowDbDeleteConfirm(false)
    }
  }

  const SectionHeader = ({
    icon: Icon,
    title,
    subtitle,
  }: {
    icon: ComponentType<{ className?: string }>
    title: string
    subtitle?: string
  }) => (
    <div className="flex items-center gap-3 mb-6">
      <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center ring-1 ring-blue-500/20">
        <Icon className="w-5 h-5 text-blue-400" />
      </div>
      <div>
        <h3 className="text-lg font-semibold text-white tracking-tight">{title}</h3>
        {subtitle && <p className="text-xs text-slate-500">{subtitle}</p>}
      </div>
    </div>
  )

  const selectedProjectName =
    projects.find((project) => project.id === selectedProjectId)?.name ?? projectName

  return (
    <div className="flex flex-col h-full max-w-5xl mx-auto w-full">
      <div className="flex items-end justify-between mb-8">
        <div>
          <h2 className="text-3xl font-bold text-white tracking-tight">Settings</h2>
          <p className="text-slate-500 mt-1">
            Manage global preferences and project configurations
          </p>
        </div>
        {status && (
          <div className="px-4 py-2 bg-slate-900/80 border border-slate-800/60 rounded-xl animate-in slide-in-from-right-4">
            <p className="text-xs font-medium text-slate-300 flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
              {status}
            </p>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-12 gap-8 overflow-y-auto pr-2 pb-12">
        <div className="md:col-span-5 space-y-8">
          <div className="bg-slate-900/20 border border-slate-800/40 rounded-2xl p-8">
            <SectionHeader
              icon={Globe}
              title="Data Management"
              subtitle="Import, export, and restore projects"
            />

            <div className="space-y-6">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2">
                    <Upload className="w-3 h-3" /> Import Project
                  </label>
                  <span className="text-[10px] text-slate-600 font-mono">ZIP archive</span>
                </div>
                <input
                  value={importPath}
                  onChange={(event) => setImportPath(event.target.value)}
                  placeholder="/path/to/project-export.zip"
                  className="w-full bg-[#0B0E14] border border-slate-800/60 text-xs text-slate-200 rounded-xl px-4 py-3 focus:ring-2 focus:ring-blue-500/20 transition-all placeholder:text-slate-700"
                />
              </div>

              <div className="space-y-3">
                <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
                  Import Mode
                </label>
                <div className="grid grid-cols-2 gap-2 p-1 bg-[#0B0E14] border border-slate-800/60 rounded-xl">
                  {(['new', 'overwrite'] as const).map((mode) => (
                    <button
                      key={mode}
                      onClick={() => setImportMode(mode)}
                      className={cn(
                        'px-3 py-2 text-[11px] font-semibold rounded-lg transition-all',
                        importMode === mode
                          ? 'bg-slate-800 text-blue-400 shadow-sm'
                          : 'text-slate-500 hover:text-slate-300'
                      )}
                    >
                      {mode === 'new' ? 'New Project' : 'Overwrite DB'}
                    </button>
                  ))}
                </div>
              </div>

              {importMode === 'new' && (
                <div className="space-y-3 animate-in fade-in slide-in-from-top-2">
                  <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
                    Local Repository Path
                  </label>
                  <input
                    value={importProjectPath}
                    onChange={(event) => setImportProjectPath(event.target.value)}
                    placeholder="/path/to/repo"
                    className="w-full bg-[#0B0E14] border border-slate-800/60 text-xs text-slate-200 rounded-xl px-4 py-3 focus:ring-2 focus:ring-blue-500/20 transition-all placeholder:text-slate-700"
                  />
                </div>
              )}

              <button
                onClick={handleImport}
                disabled={isImporting || !importPath.trim()}
                className="w-full py-3 text-xs font-bold rounded-xl bg-blue-600 hover:bg-blue-500 text-white disabled:bg-slate-800/50 disabled:text-slate-600 transition-all shadow-lg shadow-blue-600/10"
              >
                {isImporting ? 'Restoring System...' : 'Initiate Import'}
              </button>

              <div className="pt-4 border-t border-slate-800/60 space-y-5">
                <div className="flex items-center gap-2 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                  <Download className="w-3 h-3" /> Project Export
                </div>
                <div className="flex items-center justify-between">
                  <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                    Project
                  </label>
                </div>
                <select
                  value={selectedProjectId}
                  onChange={(event) => setSelectedProjectId(event.target.value)}
                  className="w-full bg-[#0B0E14] border border-slate-800/60 text-xs text-slate-200 rounded-xl px-3 py-2 focus:ring-2 focus:ring-blue-500/20 transition-all"
                >
                  <option value="">Select project</option>
                  {projects.map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.name}
                    </option>
                  ))}
                </select>
                <div className="space-y-3">
                  <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
                    Target Export Path
                  </label>
                  <input
                    value={exportPath}
                    onChange={(event) => setExportPath(event.target.value)}
                    placeholder="/path/to/backup.zip"
                    className="w-full bg-[#0B0E14] border border-slate-800/60 text-xs text-slate-200 rounded-xl px-4 py-3 focus:ring-2 focus:ring-blue-500/20 transition-all placeholder:text-slate-700"
                  />
                </div>
                <button
                  onClick={handleExport}
                  disabled={isExporting || !exportPath.trim() || !selectedProjectId}
                  className="px-6 py-3 text-xs font-bold rounded-xl bg-slate-800 hover:bg-slate-700 text-blue-400 disabled:bg-slate-900/50 disabled:text-slate-600 transition-all border border-slate-700/50"
                >
                  {isExporting ? 'Packaging Archive...' : 'Create Backup'}
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="md:col-span-7 space-y-8">
          <div className="relative">
            <TagManagement />
          </div>

          <div className="relative">
            <div className="bg-red-500/5 border border-red-900/20 rounded-2xl p-8">
              <SectionHeader
                icon={Trash2}
                title="Destructive Actions"
                subtitle="Permanent system and project deletion"
              />

              <div className="space-y-4">
                <div className="relative group">
                  <div className="flex items-center justify-between gap-6 p-4 bg-red-950/10 border border-red-900/20 rounded-xl">
                    <div className="space-y-2">
                      <div className="flex items-center justify-between gap-4">
                        <p className="text-sm font-semibold text-red-200">Delete this project</p>
                      </div>
                      <select
                        value={selectedProjectId}
                        onChange={(event) => setSelectedProjectId(event.target.value)}
                        className="w-full bg-[#0B0E14] border border-red-900/30 text-xs text-red-200/80 rounded-lg px-3 py-2 focus:ring-2 focus:ring-red-500/20 transition-all"
                      >
                        <option value="">Select project</option>
                        {projects.map((project) => (
                          <option key={project.id} value={project.id}>
                            {project.name}
                          </option>
                        ))}
                      </select>
                      {selectedProjectName && (
                        <p className="text-[11px] text-red-200/60">
                          Selected: {selectedProjectName}
                        </p>
                      )}
                      <p className="text-xs text-red-900/80">
                        All associated tasks and history will be lost.
                      </p>
                    </div>

                    {!showDeleteConfirm ? (
                      <button
                        onClick={() => setShowDeleteConfirm(true)}
                        disabled={!projectId}
                        className="px-5 py-2.5 text-xs font-bold rounded-xl border border-red-900/30 text-red-500 hover:bg-red-500 hover:text-white transition-all whitespace-nowrap disabled:opacity-30"
                      >
                        Delete Project
                      </button>
                    ) : (
                      <div className="flex gap-2 animate-in zoom-in-95">
                        <button
                          onClick={handleDeleteProject}
                          disabled={isDeleting}
                          className="px-4 py-2.5 text-xs font-bold rounded-xl bg-red-600 text-white hover:bg-red-500 shadow-lg shadow-red-600/20 transition-all whitespace-nowrap"
                        >
                          {isDeleting ? 'Deleting...' : 'Confirm Delete'}
                        </button>
                        <button
                          onClick={() => setShowDeleteConfirm(false)}
                          className="px-4 py-2.5 text-xs font-bold rounded-xl bg-slate-800 text-slate-300 hover:bg-slate-700 transition-all"
                        >
                          Cancel
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex items-center justify-between gap-6 p-4 bg-red-950/10 border border-red-900/20 rounded-xl">
                  <div className="space-y-1">
                    <p className="text-sm font-semibold text-red-200">Delete Database</p>
                    <p className="text-xs text-red-900/80">
                      Wipe all data, including ALL projects and tags.
                    </p>
                  </div>

                  {!showDbDeleteConfirm ? (
                    <button
                      onClick={() => setShowDbDeleteConfirm(true)}
                      className="px-5 py-2.5 text-xs font-bold rounded-xl border border-red-900/30 text-red-500 hover:bg-red-500 hover:text-white transition-all whitespace-nowrap"
                    >
                      Delete Database
                    </button>
                  ) : (
                    <div className="flex gap-2 animate-in zoom-in-95">
                      <button
                        onClick={handleDeleteDatabase}
                        disabled={isDbDeleting}
                        className="px-4 py-2.5 text-xs font-bold rounded-xl bg-red-600 text-white hover:bg-red-500 shadow-lg shadow-red-600/20 transition-all whitespace-nowrap"
                      >
                        {isDbDeleting ? 'Deleting...' : 'Confirm Delete'}
                      </button>
                      <button
                        onClick={() => setShowDbDeleteConfirm(false)}
                        className="px-4 py-2.5 text-xs font-bold rounded-xl bg-slate-800 text-slate-300 hover:bg-slate-700 transition-all"
                      >
                        Cancel
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
