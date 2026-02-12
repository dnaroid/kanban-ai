import { useState, useCallback, useEffect } from 'react'
import { Folder, File, ArrowUp, Home, X, Check } from 'lucide-react'

export type FileSystemPickerMode = 'folder' | 'file' | 'files'

export interface BrowseDirectoryEntry {
  name: string
  path: string
  isDirectory: boolean
}

interface FileSystemPickerProps {
  isOpen: boolean
  mode: FileSystemPickerMode
  initialPath?: string
  onSelect: (paths: string[]) => void
  onClose: () => void
  title?: string
  selectLabel?: string
  allowedExtensions?: string[]
}

export function FileSystemPicker({
  isOpen,
  mode,
  initialPath,
  onSelect,
  onClose,
  title = 'Browse',
  selectLabel,
  allowedExtensions,
}: FileSystemPickerProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [currentPath, setCurrentPath] = useState<string>('')
  const [parentPath, setParentPath] = useState<string | null>(null)
  const [homePath, setHomePath] = useState<string>('')
  const [entries, setEntries] = useState<BrowseDirectoryEntry[]>([])
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set())

  const selectBtnLabel =
    selectLabel ||
    (mode === 'folder' ? 'Select Folder' : mode === 'file' ? 'Select File' : 'Select Files')

  const loadDirectory = useCallback(async (path?: string) => {
    console.log('[FileSystemPicker] loadDirectory called, path:', path)
    setLoading(true)
    setError(null)
    try {
      const api = (window as any).api?.project
      console.log('[FileSystemPicker] api:', api)
      if (!api?.browseDirectory) {
        throw new Error('browseDirectory API not available')
      }
      const result = await api.browseDirectory({ path })
      console.log('[FileSystemPicker] result:', result)
      setCurrentPath(result.currentPath)
      setParentPath(result.parentPath)
      setHomePath(result.homePath)
      setEntries(result.entries)
    } catch (err) {
      console.error('[FileSystemPicker] error:', err)
      setError(err instanceof Error ? err.message : 'Failed to load directory')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (isOpen) {
      setSelectedPaths(new Set())
      loadDirectory(initialPath)
    }
  }, [isOpen, initialPath, loadDirectory])

  const handleNavigateUp = () => {
    if (parentPath) {
      loadDirectory(parentPath)
    }
  }

  const handleNavigateHome = () => {
    loadDirectory(homePath)
  }

  const isEntrySelectable = (entry: BrowseDirectoryEntry): boolean => {
    if (mode === 'folder') return false
    if (entry.isDirectory) return false
    if (allowedExtensions && allowedExtensions.length > 0) {
      const ext = entry.name.split('.').pop()?.toLowerCase() || ''
      return allowedExtensions.includes(ext)
    }
    return true
  }

  const handleEntryClick = (entry: BrowseDirectoryEntry) => {
    if (entry.isDirectory) {
      loadDirectory(entry.path)
      return
    }
    if (mode === 'folder' || !isEntrySelectable(entry)) return

    if (mode === 'file') {
      setSelectedPaths(new Set([entry.path]))
    } else {
      setSelectedPaths((prev) => {
        const next = new Set(prev)
        if (next.has(entry.path)) {
          next.delete(entry.path)
        } else {
          next.add(entry.path)
        }
        return next
      })
    }
  }

  const handleConfirm = () => {
    if (mode === 'folder') {
      onSelect([currentPath])
    } else {
      if (selectedPaths.size > 0) {
        onSelect(Array.from(selectedPaths))
      }
    }
    onClose()
  }

  const canConfirm = (): boolean => {
    if (loading) return false
    if (mode === 'folder') {
      return !!currentPath
    }
    return selectedPaths.size > 0
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[120] flex items-center justify-center">
      <div className="w-full max-w-2xl rounded-2xl bg-[#0F141D] shadow-2xl border border-[#1E2733] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#1E2733]">
          <div>
            <h3 className="text-lg font-semibold text-white">{title}</h3>
            {currentPath && (
              <p className="text-sm text-slate-400 mt-1 font-mono truncate max-w-md">
                {currentPath}
              </p>
            )}
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-slate-700 transition-colors">
            <X className="w-5 h-5 text-slate-400" />
          </button>
        </div>

        {/* Toolbar */}
        <div className="flex gap-2 px-5 py-3 border-b border-[#1E2733] bg-[#0B0F16]">
          <button
            onClick={handleNavigateUp}
            disabled={!parentPath || loading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#1E2733] text-slate-300 text-sm hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <ArrowUp className="w-4 h-4" />
            Up
          </button>
          <button
            onClick={handleNavigateHome}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#1E2733] text-slate-300 text-sm hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <Home className="w-4 h-4" />
            Home
          </button>
        </div>

        {/* Content */}
        <div className="max-h-[22rem] overflow-y-auto">
          {loading && (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
            </div>
          )}

          {error && (
            <div className="p-6 text-center">
              <p className="text-red-400">{error}</p>
              <button
                onClick={() => loadDirectory(currentPath)}
                className="mt-3 px-4 py-2 bg-slate-700 rounded-lg text-sm hover:bg-slate-600"
              >
                Retry
              </button>
            </div>
          )}

          {!loading && !error && entries.length === 0 && (
            <div className="p-6 text-center text-slate-400">This folder is empty</div>
          )}

          {!loading && !error && entries.length > 0 && (
            <div className="p-2">
              {entries.map((entry) => {
                const isSelected = selectedPaths.has(entry.path)
                const isSelectable = isEntrySelectable(entry)

                return (
                  <button
                    key={entry.path}
                    onClick={() => handleEntryClick(entry)}
                    disabled={!entry.isDirectory && loading}
                    className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg transition-colors ${
                      entry.isDirectory
                        ? 'hover:bg-[#1E2733] text-slate-200 cursor-pointer'
                        : isSelectable
                          ? isSelected
                            ? 'bg-blue-500/20 text-blue-300 hover:bg-blue-500/30'
                            : 'hover:bg-[#1E2733] text-slate-200 cursor-pointer'
                          : 'text-slate-500 cursor-not-allowed'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      {entry.isDirectory ? (
                        <Folder className="w-5 h-5 text-blue-400" />
                      ) : (
                        <File className="w-5 h-5 text-slate-500" />
                      )}
                      <span className="truncate">{entry.name}</span>
                    </div>
                    {entry.isDirectory ? (
                      <span className="text-xs text-slate-500">Open</span>
                    ) : isSelectable ? (
                      isSelected && <Check className="w-4 h-4 text-blue-400" />
                    ) : null}
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 px-5 py-4 border-t border-[#1E2733] bg-[#0B0F16]">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-slate-300 hover:bg-slate-700 transition-colors"
          >
            Cancel
          </button>
          {mode === 'folder' && (
            <button
              onClick={handleConfirm}
              disabled={!canConfirm()}
              className="px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {selectBtnLabel}
            </button>
          )}
          {(mode === 'file' || mode === 'files') && (
            <button
              onClick={handleConfirm}
              disabled={!canConfirm()}
              className="px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {selectBtnLabel}
              {selectedPaths.size > 0 && ` (${selectedPaths.size})`}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
