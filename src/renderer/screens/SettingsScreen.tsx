import { useState } from 'react'

type SettingsScreenProps = {
  projectId: string
  projectName: string
}

export function SettingsScreen({ projectId, projectName }: SettingsScreenProps) {
  const [exportPath, setExportPath] = useState('')
  const [importPath, setImportPath] = useState('')
  const [importMode, setImportMode] = useState<'new' | 'overwrite'>('new')
  const [importProjectPath, setImportProjectPath] = useState('')
  const [status, setStatus] = useState<string | null>(null)
  const [isExporting, setIsExporting] = useState(false)
  const [isImporting, setIsImporting] = useState(false)

  const handleExport = async () => {
    if (!exportPath.trim()) return
    setIsExporting(true)
    setStatus(null)
    try {
      const result = await window.api.backup.exportProject({
        projectId,
        toPath: exportPath.trim(),
      })
      setStatus(`Exported to ${result.path}`)
    } catch (error) {
      console.error('Export failed:', error)
      setStatus('Export failed. Check the path and try again.')
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
      setStatus('Import failed. Check the zip and settings.')
    } finally {
      setIsImporting(false)
    }
  }

  return (
    <div className="flex flex-col h-full">
      <div className="mb-6">
        <h2 className="text-2xl font-semibold text-white">Project Settings</h2>
        <p className="text-sm text-slate-500">{projectName}</p>
      </div>

      <div className="space-y-6">
        <div className="bg-slate-900/40 border border-slate-800/60 rounded-2xl p-6 space-y-4">
          <div className="text-xs text-slate-500 uppercase tracking-wider">Backup</div>
          <div className="space-y-3">
            <label className="text-xs text-slate-400">Export path (zip)</label>
            <input
              value={exportPath}
              onChange={(event) => setExportPath(event.target.value)}
              placeholder="/path/to/project-export.zip"
              className="w-full bg-[#0B0E14] border border-slate-800/60 text-xs text-slate-200 rounded-lg px-3 py-2"
            />
            <button
              onClick={handleExport}
              disabled={isExporting || !exportPath.trim()}
              className="px-4 py-2 text-xs font-semibold rounded-lg bg-blue-600 text-white disabled:bg-slate-800 disabled:text-slate-500"
            >
              {isExporting ? 'Exporting...' : 'Export'}
            </button>
          </div>
        </div>

        <div className="bg-slate-900/40 border border-slate-800/60 rounded-2xl p-6 space-y-4">
          <div className="text-xs text-slate-500 uppercase tracking-wider">Import</div>
          <div className="space-y-3">
            <label className="text-xs text-slate-400">Import zip path</label>
            <input
              value={importPath}
              onChange={(event) => setImportPath(event.target.value)}
              placeholder="/path/to/project-export.zip"
              className="w-full bg-[#0B0E14] border border-slate-800/60 text-xs text-slate-200 rounded-lg px-3 py-2"
            />
            <label className="text-xs text-slate-400">Import mode</label>
            <select
              value={importMode}
              onChange={(event) => setImportMode(event.target.value as 'new' | 'overwrite')}
              className="w-full bg-[#0B0E14] border border-slate-800/60 text-xs text-slate-200 rounded-lg px-3 py-2"
            >
              <option value="new">New project</option>
              <option value="overwrite">Overwrite database</option>
            </select>
            {importMode === 'new' && (
              <>
                <label className="text-xs text-slate-400">New project path</label>
                <input
                  value={importProjectPath}
                  onChange={(event) => setImportProjectPath(event.target.value)}
                  placeholder="/path/to/repo"
                  className="w-full bg-[#0B0E14] border border-slate-800/60 text-xs text-slate-200 rounded-lg px-3 py-2"
                />
              </>
            )}
            <button
              onClick={handleImport}
              disabled={isImporting || !importPath.trim()}
              className="px-4 py-2 text-xs font-semibold rounded-lg bg-emerald-600 text-white disabled:bg-slate-800 disabled:text-slate-500"
            >
              {isImporting ? 'Importing...' : 'Import'}
            </button>
          </div>
        </div>

        {status && <div className="text-xs text-slate-400">{status}</div>}
      </div>
    </div>
  )
}
