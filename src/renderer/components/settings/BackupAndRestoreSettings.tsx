import { useState, type ComponentType } from 'react'
import { Download, Globe, Upload } from 'lucide-react'
import { cn } from '../../lib/utils'

type Status = {
  message: string
  type: 'info' | 'error' | 'success'
} | null

type BackupAndRestoreSettingsProps = {
  projects: Array<{ id: string; name: string }>
  currentProjectId?: string
  onStatusChange: (status: Status) => void
}

export function BackupAndRestoreSettings({
  projects,
  currentProjectId,
  onStatusChange,
}: BackupAndRestoreSettingsProps) {
  const [selectedProjectId, setSelectedProjectId] = useState(currentProjectId ?? '')
  const [exportPath, setExportPath] = useState('')
  const [importPath, setImportPath] = useState('')
  const [importMode, setImportMode] = useState<'new' | 'overwrite'>('new')
  const [importProjectPath, setImportProjectPath] = useState('')
  const [isExporting, setIsExporting] = useState(false)
  const [isImporting, setIsImporting] = useState(false)

  const handleExport = async () => {
    if (!exportPath.trim()) return
    const exportProjectId = selectedProjectId || currentProjectId
    if (!exportProjectId) {
      onStatusChange({ message: 'Select a project first.', type: 'error' })
      return
    }
    setIsExporting(true)
    onStatusChange(null)
    try {
      const result = await window.api.backup.exportProject({
        projectId: exportProjectId,
        toPath: exportPath.trim(),
      })
      onStatusChange({ message: `Exported to ${result.path}`, type: 'success' })
    } catch (error) {
      console.error('Export failed:', error)
      onStatusChange({ message: 'Export failed. Check path and try again.', type: 'error' })
    } finally {
      setIsExporting(false)
    }
  }

  const handleImport = async () => {
    if (!importPath.trim()) return
    if (importMode === 'new' && !importProjectPath.trim()) {
      onStatusChange({ message: 'Project path is required for new import.', type: 'error' })
      return
    }
    setIsImporting(true)
    onStatusChange(null)
    try {
      const result = await window.api.backup.importProject({
        zipPath: importPath.trim(),
        mode: importMode,
        projectPath: importMode === 'new' ? importProjectPath.trim() : undefined,
      })
      onStatusChange({
        message: result.projectId ? `Imported project ${result.projectId}` : 'Import complete',
        type: 'success',
      })
    } catch (error) {
      console.error('Import failed:', error)
      onStatusChange({ message: 'Import failed. Check zip and settings.', type: 'error' })
    } finally {
      setIsImporting(false)
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

  return (
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
  )
}
