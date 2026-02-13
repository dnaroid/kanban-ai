import { useCallback, useEffect, useState } from 'react'
import { Link2, Plus, X, ArrowDownRight, ArrowUpRight, Link as LinkIcon } from 'lucide-react'
import { PillSelect } from '../../../common/PillSelect'
import { cn } from '../../../../lib/utils'
import type { KanbanTask, TaskLink, TaskLinkType } from '@shared/types/ipc.ts'

const dependencyRelationshipConfig = {
  blocks: {
    icon: ArrowUpRight,
    color: 'text-amber-400',
    bg: 'bg-amber-400/10',
    border: 'border-amber-400/20',
    label: 'Blocks',
  },
  blocked_by: {
    icon: ArrowDownRight,
    color: 'text-red-400',
    bg: 'bg-red-400/10',
    border: 'border-red-400/20',
    label: 'Blocked By',
  },
  relates: {
    icon: LinkIcon,
    color: 'text-blue-400',
    bg: 'bg-blue-400/10',
    border: 'border-blue-400/20',
    label: 'Relates To',
  },
} as const

interface TaskDetailsDependenciesProps {
  task: KanbanTask
}

export function TaskDetailsDependencies({ task }: TaskDetailsDependenciesProps) {
  const [dependencyLinks, setDependencyLinks] = useState<TaskLink[]>([])
  const [boardTasks, setBoardTasks] = useState<KanbanTask[]>([])
  const [dependencyError, setDependencyError] = useState<string | null>(null)
  const [isLoadingDependencies, setIsLoadingDependencies] = useState(false)
  const [isAddingDependency, setIsAddingDependency] = useState(false)
  const [dependencyQuery, setDependencyQuery] = useState('')
  const [dependencyTargetId, setDependencyTargetId] = useState<string>('')
  const [dependencyRelationship, setDependencyRelationship] = useState<TaskLinkType | 'blocked_by'>(
    'blocks'
  )

  const fetchDependencyData = useCallback(async () => {
    setIsLoadingDependencies(true)
    setDependencyError(null)
    try {
      const [tasksResult, depsRes] = await Promise.all([
        window.api.task.listByBoard({ boardId: task.boardId }),
        window.api.deps.list({ taskId: task.id }),
      ])
      const tasksRes = tasksResult
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

  const handleAddDependency = async () => {
    if (!dependencyTargetId) return

    let fromTaskId = task.id
    let toTaskId = dependencyTargetId
    let linkType: TaskLinkType =
      dependencyRelationship === 'blocked_by' ? 'blocks' : dependencyRelationship

    if (dependencyRelationship === 'blocked_by') {
      fromTaskId = dependencyTargetId
      toTaskId = task.id
      linkType = 'blocks'
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

  return (
    <div className="space-y-4 pt-4 px-6 pb-6">
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
          <div className="flex gap-4 items-end">
            <PillSelect
              label="Relationship"
              value={dependencyRelationship}
              options={dependencyRelationshipConfig as any}
              onChange={(val) => setDependencyRelationship(val as any)}
            />
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
            type === 'blocks' ? blocksLinks : type === 'blocked_by' ? blockedByLinks : relatedLinks
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
  )
}
