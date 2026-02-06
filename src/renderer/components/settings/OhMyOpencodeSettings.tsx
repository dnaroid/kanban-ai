import { useState, useEffect } from 'react'
import { FileText, Save, RotateCcw, ShieldAlert, FolderOpen, AlertCircle } from 'lucide-react'
import { cn } from '../../lib/utils'
import type { OhMyOpencodeModelField, OhMyOpencodeConfig } from '../../../shared/types/ipc'

type OhMyOpencodeSettingsProps = {
  onStatusChange: (status: { message: string; type: 'info' | 'error' | 'success' }) => void
}

export function OhMyOpencodeSettings({ onStatusChange }: OhMyOpencodeSettingsProps) {
  const [configPath, setConfigPath] = useState<string | null>(null)
  const [config, setConfig] = useState<OhMyOpencodeConfig | null>(null)
  const [modelFields, setModelFields] = useState<OhMyOpencodeModelField[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [hasBackup, setHasBackup] = useState(false)
  const [isLoadingBackup, setIsLoadingBackup] = useState(false)
  const [unsavedChanges, setUnsavedChanges] = useState(false)
  const [fieldValues, setFieldValues] = useState<
    Record<string, { model: string; variant?: string }>
  >({})

  const loadConfigPath = async () => {
    try {
      const response = await window.api.appSetting.getOhMyOpencodePath()
      setConfigPath(response.path)
      if (response.path) {
        await loadConfig(response.path)
      }
    } catch (error) {
      console.error('Failed to load config path:', error)
      onStatusChange({ message: 'Failed to load config path', type: 'error' })
    }
  }

  const loadConfig = async (path: string) => {
    try {
      setIsLoading(true)
      const response = await window.api.ohMyOpencode.readConfig({ path })
      setConfig(response.config)
      setModelFields(response.modelFields)

      const initialValues: Record<string, { model: string; variant?: string }> = {}
      for (const field of response.modelFields) {
        const key = field.path.join('.')
        initialValues[key] = { model: field.value, variant: field.variant ?? undefined }
      }
      setFieldValues(initialValues)
      setUnsavedChanges(false)

      await checkBackupExists(path)
    } catch (error) {
      console.error('Failed to load config:', error)
      onStatusChange({ message: 'Failed to load oh-my-opencode config', type: 'error' })
    } finally {
      setIsLoading(false)
    }
  }

  const checkBackupExists = async (path: string) => {
    try {
      const backupPath = `${path}.backup`
      await window.api.fileSystem.exists({ path: backupPath })
      setHasBackup(true)
    } catch {
      setHasBackup(false)
    }
  }

  const handleSelectFile = async () => {
    try {
      const response = await window.api.dialog.showOpenDialog({
        title: 'Select oh-my-opencode.json',
        filters: [{ name: 'JSON', extensions: ['json'] }],
        properties: ['openFile'],
      })

      if (response.canceled || response.filePaths.length === 0) {
        return
      }

      const selectedPath = response.filePaths[0]
      await window.api.appSetting.setOhMyOpencodePath({ path: selectedPath })
      setConfigPath(selectedPath)
      await loadConfig(selectedPath)
      onStatusChange({ message: 'Config file selected', type: 'success' })
    } catch (error) {
      console.error('Failed to select file:', error)
      onStatusChange({ message: 'Failed to select config file', type: 'error' })
    }
  }

  const handleFieldChange = (fieldKey: string, key: 'model' | 'variant', value: string) => {
    setFieldValues((prev) => {
      const existing = prev[fieldKey] || { model: '' }
      return {
        ...prev,
        [fieldKey]: {
          ...existing,
          [key]: key === 'variant' && value === '' ? undefined : value,
        },
      }
    })
    setUnsavedChanges(true)
  }

  const handleSave = async () => {
    if (!config || !configPath) {
      onStatusChange({ message: 'No config loaded', type: 'error' })
      return
    }

    try {
      const newConfig = { ...config }

      for (const field of modelFields) {
        const fieldKey = field.path.join('.')
        const newValue = fieldValues[fieldKey]
        if (!newValue) continue

        let target = newConfig as Record<string, unknown>
        for (let i = 0; i < field.path.length - 1; i++) {
          const segment = field.path[i]
          if (!target[segment]) {
            target[segment] = {}
          }
          target = target[segment] as Record<string, unknown>
        }

        const lastSegment = field.path[field.path.length - 1]
        const objValue = target[lastSegment] as Record<string, unknown> | undefined
        if (!objValue) {
          target[lastSegment] = { model: newValue.model }
        } else {
          objValue.model = newValue.model
          if (newValue.variant !== undefined) {
            objValue.variant = newValue.variant
          }
        }
      }

      await window.api.ohMyOpencode.saveConfig({ path: configPath, config: newConfig })
      await loadConfig(configPath)
      onStatusChange({ message: 'Config saved successfully', type: 'success' })
    } catch (error) {
      console.error('Failed to save config:', error)
      onStatusChange({ message: 'Failed to save config', type: 'error' })
    }
  }

  const handleBackup = async () => {
    if (!configPath) {
      onStatusChange({ message: 'No config file selected', type: 'error' })
      return
    }

    try {
      setIsLoadingBackup(true)
      const response = await window.api.ohMyOpencode.backupConfig({ path: configPath })
      await checkBackupExists(configPath)
      onStatusChange({ message: `Backup created at ${response.backupPath}`, type: 'success' })
    } catch (error) {
      console.error('Failed to create backup:', error)
      onStatusChange({ message: 'Failed to create backup', type: 'error' })
    } finally {
      setIsLoadingBackup(false)
    }
  }

  const handleRestore = async () => {
    if (!configPath) {
      onStatusChange({ message: 'No config file selected', type: 'error' })
      return
    }

    if (!hasBackup) {
      onStatusChange({ message: 'No backup found', type: 'error' })
      return
    }

    try {
      setIsLoadingBackup(true)
      await window.api.ohMyOpencode.restoreConfig({ path: configPath })
      await loadConfig(configPath)
      onStatusChange({ message: 'Config restored from backup', type: 'success' })
    } catch (error) {
      console.error('Failed to restore backup:', error)
      onStatusChange({ message: 'Failed to restore backup', type: 'error' })
    } finally {
      setIsLoadingBackup(false)
    }
  }

  useEffect(() => {
    loadConfigPath()
  }, [])

  const groupedFields = modelFields.reduce<Record<string, OhMyOpencodeModelField[]>>(
    (acc, field) => {
      const group = field.path[0]
      if (!acc[group]) {
        acc[group] = []
      }
      acc[group].push(field)
      return acc
    },
    {}
  )

  if (isLoading && !config) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-purple-500/10 ring-1 ring-purple-500/20 flex items-center justify-center text-purple-400">
          <FileText className="w-5 h-5" />
        </div>
        <div>
          <h3 className="text-lg font-bold text-white tracking-tight">Oh-My-OpenCode Config</h3>
          <p className="text-xs text-slate-500 font-medium">Manage AI model configuration</p>
        </div>
      </div>

      <div className="space-y-4">
        <div>
          <label className="block text-xs font-semibold text-slate-400 mb-2 uppercase tracking-widest">
            Config File
          </label>
          <div className="flex gap-2">
            <div className="flex-1 px-4 py-2.5 bg-slate-900/60 border border-slate-800/60 rounded-xl text-sm text-slate-300">
              {configPath || '~/.config/opencode/oh-my-opencode.json (default)'}
            </div>
            <button
              onClick={handleSelectFile}
              className="px-4 py-2.5 bg-slate-800/40 border border-slate-800/60 rounded-xl text-xs font-semibold text-slate-400 hover:text-slate-200 hover:bg-slate-800/60 transition-all flex items-center gap-2"
            >
              <FolderOpen className="w-4 h-4" />
              <span>Browse</span>
            </button>
          </div>
        </div>

        {!configPath && (
          <div className="flex items-center gap-2 p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-xl">
            <AlertCircle className="w-5 h-5 text-yellow-500 flex-shrink-0" />
            <p className="text-sm text-yellow-400">
              No config file selected. Please select a file to manage models.
            </p>
          </div>
        )}

        {config && modelFields.length > 0 && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ShieldAlert className="w-4 h-4 text-orange-400" />
                <span className="text-sm font-semibold text-slate-300">
                  Model Fields ({modelFields.length})
                </span>
              </div>
              {unsavedChanges && (
                <span className="text-xs font-bold text-orange-400 uppercase tracking-tighter">
                  Unsaved Changes
                </span>
              )}
            </div>

            {Object.entries(groupedFields).map(([groupName, fields]) => (
              <div key={groupName} className="space-y-2">
                <h4 className="text-xs font-bold text-slate-500 uppercase tracking-widest px-1">
                  {groupName}
                </h4>
                <div className="space-y-2">
                  {fields.map((field) => {
                    const fieldKey = field.path.join('.')
                    const currentValue = fieldValues[fieldKey]
                    return (
                      <div
                        key={fieldKey}
                        className="p-3 bg-slate-900/40 border border-slate-800/60 rounded-xl"
                      >
                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                          <div className="flex-1">
                            <label className="block text-xs font-semibold text-slate-400 mb-1">
                              {field.key}
                              {field.variant && ` (${field.variant})`}
                            </label>
                            <input
                              type="text"
                              value={currentValue?.model || ''}
                              onChange={(e) => handleFieldChange(fieldKey, 'model', e.target.value)}
                              className="w-full px-3 py-2 bg-slate-800/60 border border-slate-700/50 rounded-lg text-sm text-slate-300 focus:outline-none focus:ring-1 focus:ring-blue-500/50"
                              placeholder="Enter model name"
                            />
                          </div>
                          {field.variant !== null && (
                            <div className="md:w-48">
                              <label className="block text-xs font-semibold text-slate-400 mb-1">
                                Variant
                              </label>
                              <input
                                type="text"
                                value={currentValue?.variant || ''}
                                onChange={(e) =>
                                  handleFieldChange(fieldKey, 'variant', e.target.value)
                                }
                                className="w-full px-3 py-2 bg-slate-800/60 border border-slate-700/50 rounded-lg text-sm text-slate-300 focus:outline-none focus:ring-1 focus:ring-blue-500/50"
                                placeholder={field.variant || 'Enter variant'}
                              />
                            </div>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        )}

        {config && modelFields.length === 0 && (
          <div className="flex items-center gap-2 p-3 bg-blue-500/10 border border-blue-500/30 rounded-xl">
            <AlertCircle className="w-5 h-5 text-blue-500 flex-shrink-0" />
            <p className="text-sm text-blue-400">No model fields found in the config file.</p>
          </div>
        )}

        {config && (
          <div className="flex items-center gap-3 pt-4 border-t border-slate-800/40">
            <button
              onClick={handleSave}
              disabled={!unsavedChanges}
              className={cn(
                'px-4 py-2.5 rounded-xl text-sm font-semibold transition-all flex items-center gap-2',
                unsavedChanges
                  ? 'bg-blue-500 text-white hover:bg-blue-600'
                  : 'bg-slate-800/40 text-slate-500 cursor-not-allowed'
              )}
            >
              <Save className="w-4 h-4" />
              <span>Save Changes</span>
            </button>
            <div className="h-6 w-px bg-slate-800" />
            <button
              onClick={handleBackup}
              disabled={isLoadingBackup}
              className="px-4 py-2.5 bg-slate-800/40 border border-slate-800/60 rounded-xl text-sm font-semibold text-slate-400 hover:text-slate-200 hover:bg-slate-800/60 transition-all flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <RotateCcw className="w-4 h-4" />
              <span>{hasBackup ? 'Backup' : 'Create Backup'}</span>
            </button>
            <button
              onClick={handleRestore}
              disabled={!hasBackup || isLoadingBackup}
              className="px-4 py-2.5 bg-slate-800/40 border border-slate-800/60 rounded-xl text-sm font-semibold text-slate-400 hover:text-slate-200 hover:bg-slate-800/60 transition-all flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <ShieldAlert className="w-4 h-4" />
              <span>Restore</span>
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
