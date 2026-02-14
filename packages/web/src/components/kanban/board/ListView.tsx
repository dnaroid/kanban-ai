import React, { useState, useEffect } from 'react'
import { ChevronDown, ChevronRight, Plus, Trash2, Play, RefreshCw, AlertCircle, GripVertical } from 'lucide-react'
import { useSortable, SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { KanbanTask, Tag, BoardColumn, TaskLink } from '@shared/types/ipc.ts'
import { cn } from '@web/lib/utils'
import { priorityConfig, typeConfig, statusConfig } from '@web/components/kanban/drawer/TaskPropertyConfigs'

interface ListViewProps {
  columns: BoardColumn[]
  tasks: KanbanTask[]
  globalTags: Tag[]
  onTaskClick: (task: KanbanTask) => void
  onAddTask: (columnId: string) => void
  onDeleteTask: (taskId: string) => void
}

export function ListView({
  columns,
  tasks,
  globalTags,
  onTaskClick,
  onAddTask,
  onDeleteTask,
}: ListViewProps) {
  const [expandedColumns, setExpandedColumns] = useState<Record<string, boolean>>(
    columns.reduce((acc, col) => ({ ...acc, [col.id]: true }), {})
  )

  const toggleColumn = (columnId: string) => {
    setExpandedColumns((prev) => ({
      ...prev,
      [columnId]: !prev[columnId],
    }))
  }

  return (
    <div className="flex flex-col gap-4 p-8 w-full overflow-y-auto custom-scrollbar h-full">
      {columns.map((column) => {
        const columnTasks = tasks
          .filter((t) => t.columnId === column.id)
          .sort((a, b) => (a.orderInColumn || 0) - (b.orderInColumn || 0))
        const isExpanded = expandedColumns[column.id]

        return (
          <div
            key={column.id}
            className="bg-slate-900/40 border border-slate-800/50 rounded-2xl overflow-hidden backdrop-blur-md shadow-lg shadow-black/10 w-full"
          >
            <div
              className="flex items-center justify-between p-4 cursor-pointer hover:bg-slate-800/30 transition-colors"
              onClick={() => toggleColumn(column.id)}
            >
              <div className="flex items-center gap-3">
                <div className="text-slate-500">
                  {isExpanded ? <ChevronDown className="w-5 h-5" /> : <ChevronRight className="w-5 h-5" />}
                </div>
                <div
                  className="w-3 h-3 rounded-full shadow-[0_0_8px_rgba(0,0,0,0.5)]"
                  style={{ backgroundColor: column.color || '#475569' }}
                />
                <h3 className="font-bold text-slate-200 tracking-tight">{column.name}</h3>
                <span className="bg-slate-800/80 text-slate-400 text-xs px-2 py-0.5 rounded-full font-bold border border-slate-700/50">
                  {columnTasks.length}
                </span>
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  onAddTask(column.id)
                }}
                className="p-2 hover:bg-blue-500/10 rounded-xl text-slate-400 hover:text-blue-400 transition-all group/add"
              >
                <Plus className="w-5 h-5 group-hover/add:scale-110 transition-transform" />
              </button>
            </div>

            {isExpanded && (
              <div className="border-t border-slate-800/50 bg-slate-900/20">
                <SortableContext
                  items={columnTasks.map((t) => t.id)}
                  strategy={verticalListSortingStrategy}
                >
                  {columnTasks.length === 0 ? (
                    <div className="p-10 text-center text-slate-500 text-sm italic">
                      No tasks in this column
                    </div>
                  ) : (
                    <div className="flex flex-col divide-y divide-slate-800/30">
                      {columnTasks.map((task) => (
                        <ListItem
                          key={task.id}
                          task={task}
                          globalTags={globalTags}
                          onTaskClick={onTaskClick}
                          onDeleteTask={onDeleteTask}
                        />
                      ))}
                    </div>
                  )}
                </SortableContext>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

interface ListItemProps {
  task: KanbanTask
  globalTags: Tag[]
  onTaskClick: (task: KanbanTask) => void
  onDeleteTask: (taskId: string) => void
}

function ListItem({ task, globalTags, onTaskClick, onDeleteTask }: ListItemProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id,
    data: {
      type: 'task',
      task,
    },
  })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : undefined,
  }

  const [isBlocked, setIsBlocked] = useState(false)
  const [isStarting, setIsStarting] = useState(false)

  useEffect(() => {
    let isMounted = true
    const fetchBlockedState = async () => {
      try {
        const response = await window.api.deps.list({ taskId: task.id })
        if (!isMounted) return
        const blocked = response.links.some(
          (link: TaskLink) => link.linkType === 'blocks' && link.toTaskId === task.id
        )
        setIsBlocked(blocked)
      } catch (error) {
        console.error('Failed to fetch dependencies for task:', error)
      }
    }
    fetchBlockedState()
    return () => {
      isMounted = false
    }
  }, [task.id])

  const handleStart = async (e: React.MouseEvent) => {
    e.stopPropagation()
    if (isStarting) return
    setIsStarting(true)
    try {
      const rolesResponse = await window.api.roles.list()
      const roleId = rolesResponse.roles[0]?.id || 'default'
      await window.api.run.start({ taskId: task.id, roleId })
    } catch (error) {
      console.error('Failed to start run from card:', error)
    } finally {
      setIsStarting(false)
    }
  }

  const pConfig = priorityConfig[task.priority]
  const tConfig = typeConfig[task.type as keyof typeof typeConfig] || typeConfig.chore
  const sConfig = task.status ? statusConfig[task.status] : null

  const getTagColor = (tagName: string) => {
    const normalized = tagName.toLowerCase().trim()
    return globalTags.find((t) => t.name.toLowerCase().trim() === normalized)?.color || '#475569'
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      onClick={() => onTaskClick(task)}
      className={cn(
        "flex items-center gap-4 p-4 hover:bg-slate-800/40 transition-all cursor-pointer group relative overflow-hidden",
        task.status === 'running' && 'bg-blue-500/5',
        task.status === 'generating' && 'bg-purple-500/5',
        isDragging && 'opacity-50 bg-slate-800/60 z-50 shadow-2xl'
      )}
    >
      {/* Status indicator bar */}
      {sConfig && (
        <div className={cn("absolute left-0 top-0 bottom-0 w-1", sConfig.bg)} />
      )}
      
      <div 
        {...attributes} 
        {...listeners}
        className="text-slate-600 hover:text-slate-300 transition-colors p-1 cursor-grab active:cursor-grabbing"
      >
        <GripVertical className="w-4 h-4" />
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-3 mb-1.5">
          <h4 className="text-sm font-semibold text-slate-200 truncate group-hover:text-white transition-colors">
            {task.title}
          </h4>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <span
              className={cn(
                'px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider',
                pConfig.bg,
                pConfig.color
              )}
            >
              {task.priority}
            </span>
            <span
              className={cn(
                'px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider',
                tConfig.bg,
                tConfig.color
              )}
            >
              {task.type}
            </span>
            {isBlocked && (
              <span className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-red-500/10 text-red-400 border border-red-500/20">
                <AlertCircle className="w-3 h-3" />
                Blocked
              </span>
            )}
            {task.status && (
              <span className={cn(
                'px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border border-white/5',
                sConfig?.bg ?? 'bg-slate-800',
                sConfig?.color ?? 'text-slate-400'
              )}>
                {task.status}
              </span>
            )}
          </div>
        </div>
        
        {task.tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5 ml-0.5">
            {task.tags.map((tag: string, i: number) => {
              const color = getTagColor(tag)
              return (
                <span
                  key={i}
                  className="px-2 py-0.5 rounded text-[10px] font-bold transition-all border border-transparent hover:border-white/10"
                  style={{
                    backgroundColor: `${color}15`,
                    color: color,
                  }}
                >
                  {tag}
                </span>
              )
            })}
          </div>
        )}
      </div>

      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all transform translate-x-2 group-hover:translate-x-0">
        {['queued', 'paused', 'failed'].includes(task.status) && (
          <button
            onClick={handleStart}
            disabled={isStarting}
            className="p-2 text-slate-400 hover:text-blue-400 hover:bg-blue-500/10 rounded-xl transition-all"
            title="Start Run"
          >
            {isStarting ? (
              <RefreshCw className="w-4 h-4 animate-spin" />
            ) : (
              <Play className="w-4 h-4" />
            )}
          </button>
        )}
        <button
          onClick={(e) => {
            e.stopPropagation()
            onDeleteTask(task.id)
          }}
          className="p-2 text-slate-400 hover:text-red-400 hover:bg-red-500/10 rounded-xl transition-all"
          title="Delete Task"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}
