import { useEffect, useRef, useState } from 'react'
import {
  ArrowUpRight,
  Bug,
  ChevronRight,
  FileText,
  Maximize2,
  MoreVertical,
  Sparkles,
  X,
} from 'lucide-react'
import { cn } from '../../lib/utils'
import type { KanbanTask } from '@/shared/types/ipc.ts'
import { TaskDrawerChat } from './drawer/TaskDrawerChat'
import { TaskDrawerDetails } from './drawer/TaskDrawerDetails'
import { TaskDrawerProperties } from './drawer/TaskDrawerProperties'
import { TaskDrawerRuns } from './drawer/TaskDrawerRuns'

interface TaskDrawerProps {
  task: KanbanTask | null
  isOpen: boolean
  onClose: () => void
  onUpdate?: (id: string, patch: Partial<KanbanTask>) => void
  columnName?: string
}

const typeConfig = {
  feature: {
    icon: Sparkles,
    color: 'text-purple-400',
    bg: 'bg-purple-400/10',
    border: 'border-purple-400/20',
  },
  bug: {
    icon: Bug,
    color: 'text-red-400',
    bg: 'bg-red-400/10',
    border: 'border-red-400/20',
  },
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

export function TaskDrawer({ task, isOpen, onClose, onUpdate, columnName }: TaskDrawerProps) {
  const [activeTab, setActiveTab] = useState<'details' | 'vcs' | 'runs' | 'chat' | 'properties'>(
    'details'
  )
  const [isEditingTitle, setIsEditingTitle] = useState(false)
  const [editedTitle, setEditedTitle] = useState('')
  const titleInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (task) {
      setEditedTitle(task.title)
    }
  }, [task])

  useEffect(() => {
    if (isEditingTitle && titleInputRef.current) {
      titleInputRef.current.focus()
    }
  }, [isEditingTitle])

  const handleSaveTitle = () => {
    if (task && editedTitle !== task.title) {
      onUpdate?.(task.id, { title: editedTitle })
    }
    setIsEditingTitle(false)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSaveTitle()
    } else if (e.key === 'Escape') {
      setIsEditingTitle(false)
      setEditedTitle(task?.title || '')
    }
  }

  if (!isOpen || !task) return null

  const tabs = [
    { id: 'details', label: 'Details' },
    { id: 'runs', label: 'Runs' },
    { id: 'vcs', label: 'VCS' },
    { id: 'chat', label: 'Chat' },
    { id: 'properties', label: 'Properties' },
  ] as const

  const TypeIcon = typeConfig[task.type as keyof typeof typeConfig]?.icon || Sparkles

  return (
    <>
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40 transition-opacity duration-300"
        onClick={onClose}
      />
      <div className="fixed inset-y-0 right-0 w-[600px] bg-[#0B0E14] border-l border-slate-800 shadow-2xl transform transition-transform duration-300 z-50 flex flex-col">
        <div className="h-14 border-b border-slate-800 flex items-center justify-between px-4 bg-[#11151C] shrink-0">
          <div className="flex items-center gap-2 flex-1 min-w-0 mr-4">
            <div className="p-1.5 bg-blue-500/10 rounded-md border border-blue-500/20 text-blue-400 shrink-0">
              <TypeIcon className="w-4 h-4" />
            </div>
            {isEditingTitle ? (
              <input
                ref={titleInputRef}
                value={editedTitle}
                onChange={(e) => setEditedTitle(e.target.value)}
                onBlur={handleSaveTitle}
                onKeyDown={handleKeyDown}
                className="flex-1 bg-slate-900 border border-blue-500/50 text-sm font-semibold text-white px-2 py-1 rounded focus:outline-none focus:ring-1 focus:ring-blue-500/50"
              />
            ) : (
              <div
                className="flex-1 min-w-0 group cursor-pointer"
                onClick={() => setIsEditingTitle(true)}
              >
                <h2 className="text-sm font-semibold text-slate-200 truncate group-hover:text-blue-400 transition-colors">
                  {task.title}
                </h2>
              </div>
            )}
          </div>
          <div className="flex items-center gap-1">
            <button className="p-1.5 text-slate-500 hover:text-slate-300 hover:bg-slate-800 rounded transition-colors">
              <Maximize2 className="w-4 h-4" />
            </button>
            <button className="p-1.5 text-slate-500 hover:text-slate-300 hover:bg-slate-800 rounded transition-colors">
              <MoreVertical className="w-4 h-4" />
            </button>
            <div className="w-px h-4 bg-slate-800 mx-1" />
            <button
              onClick={onClose}
              className="p-1.5 text-slate-500 hover:text-white hover:bg-red-500/10 hover:border-red-500/20 border border-transparent rounded transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="flex items-center px-4 border-b border-slate-800 bg-[#11151C] shrink-0">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                'px-4 py-3 text-xs font-medium border-b-2 transition-colors relative',
                activeTab === tab.id
                  ? 'text-blue-400 border-blue-500 bg-blue-500/5'
                  : 'text-slate-500 border-transparent hover:text-slate-300 hover:bg-slate-800/50'
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-hidden relative">
          <div
            className={cn('absolute inset-0 flex flex-col', activeTab !== 'details' && 'hidden')}
          >
            <TaskDrawerDetails task={task} onUpdate={onUpdate} columnName={columnName} />
          </div>

          <div className={cn('absolute inset-0 flex flex-col', activeTab !== 'runs' && 'hidden')}>
            <TaskDrawerRuns task={task} isActive={activeTab === 'runs'} />
          </div>

          <div className={cn('absolute inset-0 flex flex-col', activeTab !== 'chat' && 'hidden')}>
            <TaskDrawerChat task={task} />
          </div>

          <div
            className={cn('absolute inset-0 flex flex-col', activeTab !== 'properties' && 'hidden')}
          >
            <TaskDrawerProperties task={task} />
          </div>

          <div
            className={cn(
              'absolute inset-0 flex items-center justify-center text-slate-500 flex-col gap-2',
              activeTab !== 'vcs' && 'hidden'
            )}
          >
            <div className="p-3 bg-slate-800/50 rounded-full">
              <ChevronRight className="w-6 h-6 opacity-50" />
            </div>
            <p className="text-xs font-medium uppercase tracking-widest">
              VCS Integration Coming Soon
            </p>
          </div>
        </div>
      </div>
    </>
  )
}
