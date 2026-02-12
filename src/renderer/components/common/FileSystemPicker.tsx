import { useState, useCallback, useEffect, useMemo } from 'react'
import {
  Folder,
  File,
  ArrowUp,
  Home,
  X,
  Check,
  Loader2,
  HardDrive,
  FileCode,
  FileJson,
  Image,
  Music,
  Video,
  FileText,
  Database,
  Package,
  Code,
  FileSpreadsheet,
  Search,
} from 'lucide-react'
import { cn } from '@/lib/utils'

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

const getFileIconInfo = (filename: string) => {
  const ext = filename.split('.').pop()?.toLowerCase() || ''

  switch (ext) {
    case 'ts':
    case 'tsx':
    case 'js':
    case 'jsx':
      return { icon: Code, color: 'text-blue-400' }
    case 'json':
    case 'yml':
    case 'yaml':
    case 'xml':
      return { icon: FileJson, color: 'text-yellow-400' }
    case 'css':
    case 'scss':
    case 'html':
      return { icon: FileCode, color: 'text-orange-400' }
    case 'png':
    case 'jpg':
    case 'jpeg':
    case 'gif':
    case 'svg':
    case 'webp':
      return { icon: Image, color: 'text-purple-400' }
    case 'mp3':
    case 'wav':
    case 'ogg':
      return { icon: Music, color: 'text-pink-400' }
    case 'mp4':
    case 'mov':
    case 'avi':
    case 'webm':
      return { icon: Video, color: 'text-red-400' }
    case 'md':
    case 'txt':
    case 'rtf':
      return { icon: FileText, color: 'text-slate-300' }
    case 'db':
    case 'sqlite':
    case 'sql':
      return { icon: Database, color: 'text-emerald-400' }
    case 'zip':
    case 'tar':
    case 'gz':
    case 'rar':
      return { icon: Package, color: 'text-amber-600' }
    case 'csv':
    case 'xlsx':
    case 'xls':
      return { icon: FileSpreadsheet, color: 'text-green-500' }
    default:
      return { icon: File, color: 'text-slate-500' }
  }
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
  const [filterText, setFilterText] = useState('')

  const loadDirectory = useCallback(async (path?: string) => {
    // Access api directly inside the callback to avoid dependency issues
    const api = (window as any).api?.project

    if (!api?.browseDirectory) {
      setError('FileSystem API not available')
      return
    }

    setLoading(true)
    setError(null)
    setFilterText('') // Clear filter when entering a new directory
    try {
      const result = await api.browseDirectory({ path })
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

  const filteredEntries = useMemo(() => {
    let result = [...entries]
    if (filterText) {
      const search = filterText.toLowerCase()
      result = result.filter((entry) => entry.name.toLowerCase().includes(search))
    }

    return result.sort((a, b) => {
      // 1. Folders first
      if (a.isDirectory !== b.isDirectory) {
        return a.isDirectory ? -1 : 1
      }

      // 2. Hidden files last
      const aHidden = a.name.startsWith('.')
      const bHidden = b.name.startsWith('.')
      if (aHidden !== bHidden) {
        return aHidden ? 1 : -1
      }

      // 3. Alphabetical
      return a.name.localeCompare(b.name)
    })
  }, [entries, filterText])

  const handleNavigateUp = () => {
    if (parentPath) loadDirectory(parentPath)
  }

  const handleNavigateHome = () => {
    loadDirectory(homePath)
  }

  const isEntrySelectable = (entry: BrowseDirectoryEntry): boolean => {
    // In folder mode, we select the *current* path, not subfolders directly via click (usually)
    // But typical UX allows selecting a folder by clicking it then "Select".
    // However, the original logic was: "if mode === 'folder' return false" for individual entry selection.
    // Let's stick to the pattern:
    // - Folder mode: Navigate to folder -> Click "Select Current Folder".
    // - File mode: Select file -> Click "Select".
    
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
    
    if (!isEntrySelectable(entry)) return

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

  // Improved UX: Double click to navigate or select
  const handleEntryDoubleClick = (entry: BrowseDirectoryEntry) => {
     if (entry.isDirectory) {
       // Already handled by single click in current logic, but standard behavior is:
       // Single click -> Select (if selectable), Double click -> Navigate
       // Since folders aren't selectable in file mode, single click navigates.
       // Let's keep single click navigation for folders for speed, 
       // but double click shouldn't trigger it twice.
       return 
     }

     if (isEntrySelectable(entry)) {
        if (mode === 'file') {
           setSelectedPaths(new Set([entry.path]))
           // Immediate confirm on double click for single file
           onSelect([entry.path])
           onClose()
        }
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
    if (mode === 'folder') return !!currentPath
    return selectedPaths.size > 0
  }

  if (!isOpen) return null

  const selectBtnLabel =
    selectLabel ||
    (mode === 'folder' ? 'Select Folder' : mode === 'file' ? 'Select File' : 'Select Files')

  return (
    // Overlay
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[9999] flex items-center justify-center p-4">
      
      {/* Modal Container */}
      <div className="w-full max-w-3xl bg-[#0B0E14] border border-slate-800/60 rounded-2xl shadow-2xl flex flex-col h-[640px]">
        
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-slate-800/60">
          <div>
            <h2 className="text-xl font-bold text-white tracking-tight">{title}</h2>
            <div className="flex items-center gap-2 mt-1 text-slate-500">
               <HardDrive className="w-3.5 h-3.5" />
               <p className="text-xs font-mono truncate max-w-md opacity-80">
                  {currentPath || 'Root'}
               </p>
            </div>
          </div>
          <button 
            onClick={onClose} 
            className="p-2 rounded-lg text-slate-500 hover:text-white hover:bg-slate-800/50 transition-all"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Toolbar */}
        <div className="px-6 py-4 flex items-center gap-3 bg-[#0B0E14]">
           <div className="flex gap-2">
            <button
              onClick={handleNavigateUp}
              disabled={!parentPath || loading}
              className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[#161B26] border border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all text-xs font-medium uppercase tracking-wider"
              title="Go Up"
            >
              <ArrowUp className="w-4 h-4" />
              <span className="hidden sm:inline">Up</span>
            </button>
            <button
              onClick={handleNavigateHome}
              disabled={loading}
              className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[#161B26] border border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all text-xs font-medium uppercase tracking-wider"
              title="Go Home"
            >
              <Home className="w-4 h-4" />
              <span className="hidden sm:inline">Home</span>
            </button>
           </div>
           
           {/* Filter Input */}
           <div className="flex-1 relative group">
              <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none">
                <Search className="w-4 h-4 text-slate-500 group-focus-within:text-blue-500/50 transition-colors" />
              </div>
              <input 
                value={filterText}
                onChange={(e) => setFilterText(e.target.value)}
                placeholder="Filter items..."
                className="w-full bg-[#161B26] border border-slate-800/60 text-sm text-slate-300 rounded-xl pl-10 pr-10 py-2 hover:border-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500/30 transition-all placeholder:text-slate-600"
              />
              {filterText && (
                <button 
                  onClick={() => setFilterText('')}
                  className="absolute inset-y-0 right-3 flex items-center text-slate-500 hover:text-slate-300 transition-colors"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
           </div>
        </div>

        {/* File List Content */}
        <div className="flex-1 overflow-hidden px-6 pb-2 min-h-[300px]">
          <div className="h-full bg-[#0B0E14] border border-slate-800/60 rounded-xl overflow-hidden shadow-inner shadow-black/40 flex flex-col">
            
            {/* Table Header */}
            <div className="sticky top-0 z-10 bg-slate-900/80 backdrop-blur-md border-b border-slate-800/60 flex items-center px-4 py-3 text-[10px] uppercase tracking-[0.2em] text-slate-500 font-bold">
              <div className="flex-1">Name</div>
              <div className="w-20 text-right">Type</div>
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar p-1">
              {loading ? (
                <div className="flex flex-col items-center justify-center h-full gap-3 text-slate-500">
                  <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
                  <p className="text-xs font-medium uppercase tracking-wider">Loading...</p>
                </div>
              ) : error ? (
                <div className="flex flex-col items-center justify-center h-full gap-4 text-slate-400">
                   <div className="w-12 h-12 rounded-full bg-red-500/10 flex items-center justify-center">
                      <X className="w-6 h-6 text-red-400" />
                   </div>
                   <p className="text-sm">{error}</p>
                   <button 
                      onClick={() => loadDirectory(currentPath)}
                      className="text-xs text-blue-400 hover:text-blue-300 hover:underline"
                   >
                      Try again
                   </button>
                </div>
              ) : filteredEntries.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full gap-3 text-slate-500">
                  {filterText ? <Search className="w-12 h-12 opacity-10" /> : <Folder className="w-12 h-12 opacity-10" />}
                  <p className="text-sm">{filterText ? 'No matches found' : 'Folder is empty'}</p>
                </div>
              ) : (
                <div className="space-y-0.5">
                  {filteredEntries.map((entry) => {
                    const isSelected = selectedPaths.has(entry.path)
                    const isSelectable = isEntrySelectable(entry)
                    const isFolder = entry.isDirectory

                    const fileIconInfo = getFileIconInfo(entry.name)
                    const IconComponent = isFolder ? Folder : fileIconInfo.icon
                    const iconColor = isFolder 
                      ? "text-blue-400/80 group-hover:text-blue-400" 
                      : isSelected 
                        ? "text-blue-400" 
                        : `${fileIconInfo.color} group-hover:opacity-100 opacity-80`

                    const isHidden = entry.name.startsWith('.')

                    return (
                      <div
                        key={entry.path}
                        onClick={() => handleEntryClick(entry)}
                        onDoubleClick={() => handleEntryDoubleClick(entry)}
                        className={cn(
                          "group flex items-center justify-between px-3 py-2 rounded-lg cursor-pointer transition-all duration-200 border border-transparent",
                          isFolder 
                            ? "hover:bg-[#1E2733] hover:border-slate-800/50" 
                            : isSelectable 
                              ? isSelected 
                                ? "bg-blue-500/10 border-blue-500/20 shadow-sm shadow-blue-500/5" 
                                : "hover:bg-[#1E2733] hover:border-slate-800/50"
                              : "opacity-50 cursor-not-allowed grayscale",
                          isHidden && "opacity-40 hover:opacity-100"
                        )}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <IconComponent className={cn(
                            "w-5 h-5 transition-colors",
                            iconColor
                          )} />
                          <span className={cn(
                            "truncate text-sm font-medium transition-colors",
                            isSelected ? "text-blue-100" : "text-slate-300 group-hover:text-slate-100"
                          )}>
                            {entry.name}
                          </span>
                        </div>
                        
                        <div className="flex items-center gap-3">
                           {/* Selection Indicator */}
                           {isSelectable && isSelected && (
                              <div className="w-5 h-5 rounded-full bg-blue-500 text-white flex items-center justify-center shadow-lg shadow-blue-500/30">
                                 <Check className="w-3 h-3" />
                              </div>
                           )}
                           <span className="text-[10px] uppercase tracking-wider text-slate-600 font-bold w-12 text-right">
                              {isFolder ? 'DIR' : entry.name.split('.').pop()?.toUpperCase() || 'FILE'}
                           </span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-6 pt-4 flex items-center justify-end gap-3 border-t border-slate-800/60 bg-[#0B0E14] rounded-b-2xl">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold rounded-lg text-slate-400 hover:text-white hover:bg-slate-800/50 transition-all"
          >
            Cancel
          </button>
          
          <button
            onClick={handleConfirm}
            disabled={!canConfirm()}
            className={cn(
              "px-6 py-2.5 text-xs font-bold uppercase tracking-wide rounded-lg shadow-lg transition-all",
              "bg-blue-600 text-white shadow-blue-600/20",
              "hover:bg-blue-500 hover:shadow-blue-500/30 hover:scale-[1.02]",
              "active:scale-[0.98]",
              "disabled:bg-slate-800 disabled:text-slate-500 disabled:shadow-none disabled:hover:scale-100 disabled:cursor-not-allowed"
            )}
          >
            <span className="flex items-center gap-2">
               {selectBtnLabel}
               {selectedPaths.size > 0 && (
                 <span className="bg-white/20 px-1.5 py-0.5 rounded text-[10px]">{selectedPaths.size}</span>
               )}
            </span>
          </button>
        </div>
      </div>
    </div>
  )
}
