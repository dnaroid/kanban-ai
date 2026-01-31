import { useCallback, useEffect, useRef, useState } from 'react'
import {
  AlertTriangle,
  ArrowUpRight,
  Bug,
  Check,
  ChevronDown,
  Clock,
  FileText,
  Link2,
  Loader2,
  Plus,
  Sparkles,
  Tag,
  Wand2,
  X,
  Zap,
} from 'lucide-react'
import { cn } from '../../../lib/utils'
import type { KanbanTask, TaskLink, TaskLinkType } from '@/shared/types/ipc.ts'

interface TaskDrawerDetailsProps {
  task: KanbanTask
  onUpdate?: (id: string, patch: Partial<KanbanTask>) => void
  columnName?: string
}

const difficultyConfig = {
  easy: {
    icon: Check,
    color: 'text-emerald-400',
    bg: 'bg-emerald-400/10',
    border: 'border-emerald-400/20',
  },
  medium: {
    icon: ArrowUpRight,
    color: 'text-blue-400',
    bg: 'bg-blue-400/10',
    border: 'border-blue-400/20',
  },
  hard: {
    icon: AlertTriangle,
    color: 'text-amber-400',
    bg: 'bg-amber-400/10',
    border: 'border-amber-400/20',
  },
  epic: {
    icon: Zap,
    color: 'text-purple-400',
    bg: 'bg-purple-400/10',
    border: 'border-purple-400/20',
  },
}

const priorityConfig = {
  low: {
    icon: ArrowUpRight,
    color: 'text-slate-400',
    bg: 'bg-slate-400/10',
    border: 'border-slate-400/20',
  },
  medium: {
    icon: ArrowUpRight,
    color: 'text-blue-400',
    bg: 'bg-blue-400/10',
    border: 'border-blue-400/20',
  },
  high: {
    icon: AlertTriangle,
    color: 'text-amber-400',
    bg: 'bg-amber-400/10',
    border: 'border-amber-400/20',
  },
  urgent: { icon: Zap, color: 'text-red-400', bg: 'bg-red-400/10', border: 'border-red-400/20' },
}

const typeConfig = {
  feature: {
    icon: Sparkles,
    color: 'text-purple-400',
    bg: 'bg-purple-400/10',
    border: 'border-purple-400/20',
  },
  bug: { icon: Bug, color: 'text-red-400', bg: 'bg-red-400/10', border: 'border-red-400/20' },
  chore: {
    icon: FileText,
    color: 'text-slate-400',
    bg: 'bg-slate-400/10',
    border: 'border-slate-400/20',
  },
  improvement: {
    icon: ArrowUpRight,
    color: 'text-blue-400',
    bg: 'bg-blue-400/10',
    border: 'border-blue-400/20',
  },
}

const statusConfig = {
  todo: {
    icon: Clock,
    color: 'text-slate-400',
    bg: 'bg-slate-400/10',
    border: 'border-slate-400/20',
  },
  'in-progress': {
    icon: Clock,
    color: 'text-blue-400',
    bg: 'bg-blue-400/10',
    border: 'border-blue-400/20',
  },
  done: {
    icon: Check,
    color: 'text-emerald-400',
    bg: 'bg-emerald-400/10',
    border: 'border-emerald-400/20',
  },
}

export function TaskDrawerDetails({ task, onUpdate, columnName }: TaskDrawerDetailsProps) {
  const [editedDescription, setEditedDescription] = useState(task.description || '')

  const [newTag, setNewTag] = useState('')
  const [isAddingTag, setIsAddingTag] = useState(false)
  const tagInputRef = useRef<HTMLInputElement>(null)

  const [dependencyLinks, setDependencyLinks] = useState<TaskLink[]>([])
  const [boardTasks, setBoardTasks] = useState<KanbanTask[]>([])
  const [dependencyError, setDependencyError] = useState<string | null>(null)
  const [isLoadingDependencies, setIsLoadingDependencies] = useState(false)
  const [isAddingDependency, setIsAddingDependency] = useState(false)
  const [isGeneratingStory, setIsGeneratingStory] = useState(false)
  const [generationError, setGenerationError] = useState<string | null>(null)
  const [dependencyQuery, setDependencyQuery] = useState('')
  const [dependencyTargetId, setDependencyTargetId] = useState<string>('')
  const [dependencyRelationship, setDependencyRelationship] = useState<TaskLinkType | 'blocked_by'>(
    'blocks'
  )

  useEffect(() => {
    setEditedDescription(task.description || '')
  }, [task.description])

  useEffect(() => {
    if (isAddingTag && tagInputRef.current) {
      tagInputRef.current.focus()
    }
  }, [isAddingTag])

  // Fetch tasks and dependencies
  const fetchDependencyData = useCallback(async () => {
    setIsLoadingDependencies(true)
    setDependencyError(null)
    try {
      const [tasksRes, depsRes] = await Promise.all([
        window.api.task.listByBoard({ boardId: task.boardId }),
        window.api.deps.list({ taskId: task.id }),
      ])
      setBoardTasks(tasksRes.tasks)
      setDependencyLinks(depsRes.links)
    } catch (error) {
      console.error('Failed to load dependency data:', error)
      setDependencyError('Failed to load dependency data')
    } finally {
      setIsLoadingDependencies(false)
    }
  }, [task.id, task.boardId])

  useEffect(() => {
    fetchDependencyData()
  }, [fetchDependencyData])

  const handleUpdateDifficulty = (difficulty: string) => {
    onUpdate?.(task.id, { difficulty: difficulty as KanbanTask['difficulty'] })
  }

  const handleUpdatePriority = (priority: string) => {
    onUpdate?.(task.id, { priority: priority as KanbanTask['priority'] })
  }

  const handleUpdateType = (type: string) => {
    onUpdate?.(task.id, { type: type as KanbanTask['type'] })
  }

  const handleAddTag = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && newTag.trim()) {
      const updatedTags = [...(task.tags || []), newTag.trim()]
      onUpdate?.(task.id, { tags: updatedTags })
      setNewTag('')
      setIsAddingTag(false)
    } else if (e.key === 'Escape') {
      setIsAddingTag(false)
      setNewTag('')
    }
  }

  const handleRemoveTag = (tagToRemove: string) => {
    const updatedTags = (task.tags || []).filter((tag) => tag !== tagToRemove)
    onUpdate?.(task.id, { tags: updatedTags })
  }

  const handleSaveDescription = () => {
    if (editedDescription !== task.description) {
      onUpdate?.(task.id, { description: editedDescription })
    }
  }

  const handleImproveDescription = async () => {
    setIsGeneratingStory(true)
    setGenerationError(null)

    let timer: ReturnType<typeof setTimeout>
    const timeoutPromise = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        reject(new Error('TIMEOUT'))
      }, 120000)
    })

    try {
      const response = await Promise.race([
        window.api.opencode.generateUserStory({ taskId: task.id }),
        timeoutPromise,
      ])
      const descriptionText = String((response as Record<string, unknown>)['description'] ?? '')
      if (descriptionText.trim().length > 0) {
        setEditedDescription(descriptionText)
        setGenerationError(null)
      }
    } catch (error: any) {
      if (error.message === 'TIMEOUT') {
        setGenerationError('AI generation timed out (45s). The service might be busy.')
      } else {
        console.error('Failed to generate user story:', error)
        setGenerationError('Failed to generate user story. Please try again.')
      }
    } finally {
      clearTimeout(timer!)
      setIsGeneratingStory(false)
    }
  }

  // Dependency Handlers
  const handleAddDependency = async () => {
    if (!dependencyTargetId) return

    // Determine from/to based on relationship
    // blocks: current blocks target (current -> target)
    // blocked_by: target blocks current (target -> current)
    // relates: current relates to target (current <-> target)

    let fromTaskId = task.id
    let toTaskId = dependencyTargetId
    let linkType: TaskLinkType =
      dependencyRelationship === 'blocked_by' ? 'blocks' : dependencyRelationship

    if (dependencyRelationship === 'blocked_by') {
      fromTaskId = dependencyTargetId
      toTaskId = task.id
      linkType = 'blocks' // The API likely uses 'blocks' for direction
    }

    try {
      await window.api.deps.add({ fromTaskId, toTaskId, type: linkType })
      await fetchDependencyData()
      setIsAddingDependency(false)
      setDependencyTargetId('')
      setDependencyQuery('')
    } catch (error) {
      console.error('Failed to add dependency:', error)
      setDependencyError('Failed to add dependency')
    }
  }

  const handleRemoveDependency = async (linkId: string) => {
    try {
      await window.api.deps.remove({ linkId })
      await fetchDependencyData()
    } catch (error) {
      console.error('Failed to remove dependency:', error)
      setDependencyError('Failed to remove dependency')
    }
  }

  const getTaskLabel = (taskId: string) => {
    const t = boardTasks.find((bt) => bt.id === taskId)
    return t ? t.title : taskId.slice(0, 8)
  }

  const getOtherTaskId = (link: TaskLink) => {
    return link.fromTaskId === task.id ? link.toTaskId : link.fromTaskId
  }

  const blocksLinks = dependencyLinks.filter(
    (l) => l.fromTaskId === task.id && l.linkType === 'blocks'
  )
  const blockedByLinks = dependencyLinks.filter(
    (l) => l.toTaskId === task.id && l.linkType === 'blocks'
  )
  const relatedLinks = dependencyLinks.filter((l) => l.linkType === 'relates')

  const dependencyResults = boardTasks.filter(
    (t) =>
      t.id !== task.id &&
      (t.title.toLowerCase().includes(dependencyQuery.toLowerCase()) ||
        t.id.includes(dependencyQuery))
  )

  const priorityStyle = priorityConfig[task.priority] || priorityConfig.medium
  const difficultyStyle = difficultyConfig[task.difficulty || 'medium'] || difficultyConfig.medium
  const typeStyle = typeConfig[task.type as keyof typeof typeConfig] || typeConfig.feature
  const statusStyle = statusConfig[task.status] || statusConfig.todo

  return (
    <div className="flex flex-col h-full bg-[#0B0E14] animate-in fade-in duration-300">
      <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-8">
        {/* Status & Properties Grid */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1.5">
              <div className="w-1 h-1 rounded-full bg-slate-500" />
              Status
            </label>
            <div
              className={cn(
                'flex items-center gap-2 p-2 rounded-lg border',
                statusStyle.bg,
                statusStyle.border
              )}
            >
              <statusStyle.icon className={cn('w-4 h-4', statusStyle.color)} />
              <span className={cn('text-xs font-bold uppercase tracking-wider', statusStyle.color)}>
                {task.status.replace('_', ' ')}
              </span>
              <span className="ml-auto text-[10px] text-slate-500 font-medium px-2 py-0.5 bg-black/20 rounded">
                {columnName || 'Board'}
              </span>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1.5">
              <div className="w-1 h-1 rounded-full bg-slate-500" />
              Difficulty
            </label>
            <div className="relative group">
              <select
                value={task.difficulty || 'medium'}
                onChange={(e) => handleUpdateDifficulty(e.target.value)}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
              >
                {Object.keys(difficultyConfig).map((p) => (
                  <option key={p} value={p}>
                    {p.charAt(0).toUpperCase() + p.slice(1)}
                  </option>
                ))}
              </select>
              <div
                className={cn(
                  'flex items-center gap-2 p-2 rounded-lg border transition-all group-hover:brightness-110',
                  difficultyStyle.bg,
                  difficultyStyle.border
                )}
              >
                <difficultyStyle.icon className={cn('w-4 h-4', difficultyStyle.color)} />
                <span
                  className={cn(
                    'text-xs font-bold uppercase tracking-wider',
                    difficultyStyle.color
                  )}
                >
                  {task.difficulty || 'Medium'}
                </span>
                <ChevronDown className="w-3 h-3 ml-auto text-slate-500 group-hover:text-slate-400" />
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1.5">
              <div className="w-1 h-1 rounded-full bg-slate-500" />
              Priority
            </label>

            <div
              className={cn(
                'flex items-center gap-2 p-2 rounded-lg border',
                statusStyle.bg,
                statusStyle.border
              )}
            >
              <statusStyle.icon className={cn('w-4 h-4', statusStyle.color)} />
              <span className={cn('text-xs font-bold uppercase tracking-wider', statusStyle.color)}>
                {task.status.replace('_', ' ')}
              </span>
              <span className="ml-auto text-[10px] text-slate-500 font-medium px-2 py-0.5 bg-black/20 rounded">
                {columnName || 'Board'}
              </span>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1.5">
              <div className="w-1 h-1 rounded-full bg-slate-500" />
              Priority
            </label>
            <div className="relative group">
              <select
                value={task.priority}
                onChange={(e) => handleUpdatePriority(e.target.value)}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
              >
                {Object.keys(priorityConfig).map((p) => (
                  <option key={p} value={p}>
                    {p.charAt(0).toUpperCase() + p.slice(1)}
                  </option>
                ))}
              </select>
              <div
                className={cn(
                  'flex items-center gap-2 p-2 rounded-lg border transition-all group-hover:brightness-110',
                  priorityStyle.bg,
                  priorityStyle.border
                )}
              >
                <priorityStyle.icon className={cn('w-4 h-4', priorityStyle.color)} />
                <span
                  className={cn('text-xs font-bold uppercase tracking-wider', priorityStyle.color)}
                >
                  {task.priority}
                </span>
                <ChevronDown className="w-3 h-3 ml-auto text-slate-500 group-hover:text-slate-400" />
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1.5">
              <div className="w-1 h-1 rounded-full bg-slate-500" />
              Type
            </label>
            <div className="relative group">
              <select
                value={task.type}
                onChange={(e) => handleUpdateType(e.target.value)}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
              >
                {Object.keys(typeConfig).map((t) => (
                  <option key={t} value={t}>
                    {t.charAt(0).toUpperCase() + t.slice(1)}
                  </option>
                ))}
              </select>
              <div
                className={cn(
                  'flex items-center gap-2 p-2 rounded-lg border transition-all group-hover:brightness-110',
                  typeStyle.bg,
                  typeStyle.border
                )}
              >
                <typeStyle.icon className={cn('w-4 h-4', typeStyle.color)} />
                <span className={cn('text-xs font-bold uppercase tracking-wider', typeStyle.color)}>
                  {task.type}
                </span>
                <ChevronDown className="w-3 h-3 ml-auto text-slate-500 group-hover:text-slate-400" />
              </div>
            </div>
          </div>
        </div>

        {/* Tags */}
        <div className="space-y-3">
          <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1.5">
            <Tag className="w-3 h-3" />
            Tags
          </label>
          <div className="flex flex-wrap gap-2">
            {task.tags?.map((tag) => (
              <span
                key={tag}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium bg-slate-800 text-slate-300 border border-slate-700/50 group hover:border-slate-600 transition-colors"
              >
                {tag}
                <button
                  onClick={() => handleRemoveTag(tag)}
                  className="p-0.5 hover:bg-slate-700 rounded-sm text-slate-500 hover:text-red-400 transition-colors"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}
            {isAddingTag ? (
              <div className="flex items-center gap-2">
                <input
                  ref={tagInputRef}
                  type="text"
                  value={newTag}
                  onChange={(e) => setNewTag(e.target.value)}
                  onKeyDown={handleAddTag}
                  onBlur={() => !newTag && setIsAddingTag(false)}
                  className="bg-slate-900 border border-blue-500/50 text-xs text-white px-2 py-1 rounded-md w-24 focus:outline-none focus:ring-1 focus:ring-blue-500/50"
                  placeholder="New tag..."
                />
              </div>
            ) : (
              <button
                onClick={() => setIsAddingTag(true)}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium bg-slate-800/50 text-slate-400 border border-dashed border-slate-700 hover:text-blue-400 hover:border-blue-500/50 hover:bg-blue-500/5 transition-all"
              >
                <Plus className="w-3 h-3" />
                Add Tag
              </button>
            )}
          </div>
        </div>

        {/* Description */}
        <div className="space-y-3 group">
          <div className="flex items-center justify-between">
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1.5">
              <FileText className="w-3 h-3" />
              Description
            </label>
            <div className="flex items-center gap-1">
              <button
                onClick={handleImproveDescription}
                disabled={isGeneratingStory}
                className={cn(
                  'p-1.5 text-purple-400 hover:text-white hover:bg-purple-500/10 rounded transition-colors flex items-center gap-1.5',
                  isGeneratingStory && 'opacity-50 cursor-not-allowed'
                )}
                title="Improve with AI"
              >
                {isGeneratingStory ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Wand2 className="w-3.5 h-3.5" />
                )}
                <span className="text-[10px] font-bold">
                  {isGeneratingStory ? 'Generating...' : 'AI Improve'}
                </span>
              </button>
            </div>
          </div>
        </div>

        {generationError && (
          <div className="mb-3 text-[10px] text-red-400 bg-red-400/10 border border-red-400/20 px-3 py-2 rounded-lg flex items-center gap-2 animate-in fade-in slide-in-from-top-1">
            <AlertTriangle className="w-3 h-3 shrink-0" />
            <span className="flex-1">{generationError}</span>
            <button
              onClick={() => setGenerationError(null)}
              className="p-0.5 hover:bg-red-400/20 rounded transition-colors"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        )}

        <div className="relative">
          <textarea
            value={editedDescription}
            onChange={(e) => setEditedDescription(e.target.value)}
            onBlur={handleSaveDescription}
            disabled={isGeneratingStory}
            placeholder="Add a description..."
            className={cn(
              'w-full min-h-[120px] bg-[#161B26] border border-slate-800 rounded-xl p-4 text-sm text-slate-300 placeholder:text-slate-600 focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20 transition-all resize-y',
              isGeneratingStory && 'opacity-50 cursor-not-allowed'
            )}
          />
        </div>
      </div>

      {/* Dependencies */}
      <div className="space-y-4 pt-4 border-t border-slate-800/50 -mx-6 px-6 pb-6">
        <div className="flex items-center justify-between">
          <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1.5">
            <Link2 className="w-3 h-3" />
            Dependencies
          </label>
          <button
            onClick={() => setIsAddingDependency(!isAddingDependency)}
            className={cn(
              'p-1.5 rounded transition-colors',
              isAddingDependency
                ? 'bg-blue-500/10 text-blue-400'
                : 'text-slate-400 hover:text-white hover:bg-slate-800'
            )}
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>

        {dependencyError && (
          <div className="text-xs text-red-400 bg-red-500/10 p-2 rounded border border-red-500/20">
            {dependencyError}
          </div>
        )}

        {isAddingDependency && (
          <div className="bg-slate-900/50 p-3 rounded-lg border border-slate-800 space-y-3 animate-in fade-in slide-in-from-top-2">
            <div className="flex gap-2">
              <select
                value={dependencyRelationship}
                onChange={(e) => setDependencyRelationship(e.target.value as TaskLinkType)}
                className="bg-[#161B26] border border-slate-700 text-xs text-slate-300 rounded px-2 py-1.5 focus:outline-none focus:border-blue-500/50"
              >
                <option value="blocks">Blocks</option>
                <option value="blocked_by">Blocked By</option>
                <option value="relates">Relates To</option>
              </select>
              <div className="flex-1 relative">
                <input
                  type="text"
                  value={dependencyQuery}
                  onChange={(e) => setDependencyQuery(e.target.value)}
                  placeholder="Search tasks..."
                  className="w-full bg-[#161B26] border border-slate-700 text-xs text-slate-300 rounded px-2 py-1.5 focus:outline-none focus:border-blue-500/50"
                />
                {dependencyQuery && (
                  <div className="absolute top-full left-0 right-0 mt-1 max-h-40 overflow-y-auto bg-[#161B26] border border-slate-700 rounded shadow-xl z-20">
                    {dependencyResults.map((t) => (
                      <div
                        key={t.id}
                        className="px-2 py-1.5 text-xs text-slate-300 hover:bg-slate-800 cursor-pointer flex justify-between"
                        onClick={() => {
                          setDependencyTargetId(t.id)
                          setDependencyQuery(t.title)
                        }}
                      >
                        <span className="truncate flex-1">{t.title}</span>
                        <span className="text-slate-500 ml-2 font-mono">{t.id.slice(0, 4)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <button
                onClick={handleAddDependency}
                disabled={!dependencyTargetId}
                className="px-3 py-1.5 bg-blue-600 text-white text-xs font-bold rounded hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Add
              </button>
            </div>
          </div>
        )}

        <div className="space-y-2">
          {(['blocks', 'blocked_by', 'relates_to'] as const).map((type) => {
            const links =
              type === 'blocks'
                ? blocksLinks
                : type === 'blocked_by'
                  ? blockedByLinks
                  : relatedLinks
            if (links.length === 0) return null

            const label =
              type === 'blocks' ? 'Blocks' : type === 'blocked_by' ? 'Blocked By' : 'Relates To'
            const color =
              type === 'blocks'
                ? 'text-amber-400'
                : type === 'blocked_by'
                  ? 'text-red-400'
                  : 'text-blue-400'

            return (
              <div key={type} className="space-y-1">
                <span className={cn('text-[10px] font-bold uppercase tracking-wider px-2', color)}>
                  {label}
                </span>
                <div className="space-y-1">
                  {links.map((link) => (
                    <div
                      key={link.id}
                      className="group flex items-center justify-between bg-slate-900/30 border border-slate-800/50 rounded-lg px-3 py-2 hover:border-slate-700 transition-colors"
                    >
                      <span className="text-xs text-slate-300 truncate flex-1">
                        {getTaskLabel(getOtherTaskId(link))}
                      </span>
                      <button
                        onClick={() => handleRemoveDependency(link.id)}
                        className="opacity-0 group-hover:opacity-100 p-1 text-slate-500 hover:text-red-400 transition-opacity"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )
          })}

          {dependencyLinks.length === 0 && !isLoadingDependencies && (
            <div className="text-center py-4 text-xs text-slate-600 italic">No dependencies</div>
          )}
        </div>
      </div>
    </div>
  )
}
