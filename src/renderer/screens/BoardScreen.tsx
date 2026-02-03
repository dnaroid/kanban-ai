import { useEffect, useState } from 'react'
import {
  closestCorners,
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import {
  arrayMove,
  horizontalListSortingStrategy,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { AlertCircle, Clock, Edit2, GripVertical, Play, Plus, Trash2, X } from 'lucide-react'
import type {
  Board,
  BoardColumn,
  BoardColumnInput,
  CreateTaskInput,
  KanbanTask,
  Tag,
} from '@/shared/types/ipc.ts'
import { cn } from '../lib/utils'
import { TaskDrawer } from '../components/kanban/TaskDrawer'
import { Check, Search } from 'lucide-react'

interface BoardScreenProps {
  projectId: string
}

interface SortableTaskProps {
  task: KanbanTask
  onDelete?: (id: string) => void
  onClick?: (task: KanbanTask) => void
}

function SortableTask({ task, onDelete, onClick }: SortableTaskProps) {
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
  }

  const [isBlocked, setIsBlocked] = useState(false)

  useEffect(() => {
    let isMounted = true
    const fetchBlockedState = async () => {
      try {
        const response = await window.api.deps.list({ taskId: task.id })
        if (!isMounted) return
        const blocked = response.links.some(
          (link) => link.linkType === 'blocks' && link.toTaskId === task.id
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

  const priorityColors = {
    postpone: 'border-slate-500/30 text-slate-400 bg-slate-500/5',
    low: 'border-emerald-500/30 text-emerald-400 bg-emerald-500/5',
    normal: 'border-blue-500/30 text-blue-400 bg-blue-500/5',
    urgent: 'border-red-500/30 text-red-400 bg-red-500/5',
  }

  const statusColors = {
    queued: 'border-slate-500/30 text-slate-400 bg-slate-500/5',
    running: 'border-blue-500/30 text-blue-400 bg-blue-500/5 animate-pulse',
    question: 'border-amber-500/30 text-amber-400 bg-amber-500/5',
    paused: 'border-slate-500/30 text-slate-500 bg-slate-500/5',
    done: 'border-emerald-500/30 text-emerald-400 bg-emerald-500/5',
    failed: 'border-red-500/30 text-red-400 bg-red-500/5',
    generating: 'border-purple-500/30 text-purple-400 bg-purple-500/5 animate-pulse',
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      onClick={() => onClick?.(task)}
      className={cn(
        'bg-[#11151C] border border-slate-700 rounded-xl mb-3 group hover:border-slate-600 hover:shadow-lg hover:shadow-black/20 transition-all cursor-grab active:cursor-grabbing overflow-hidden',
        isDragging && 'opacity-50 shadow-2xl scale-105'
      )}
    >
      <div className="flex items-stretch gap-0">
        <button
          {...attributes}
          {...listeners}
          className="px-2 flex items-center justify-center text-slate-700 hover:text-slate-400 hover:bg-slate-800/50 transition-colors"
        >
          <GripVertical className="w-5 h-5" />
        </button>

        <div className="flex-1 min-w-0 p-3 pl-1">
          <div className="flex items-start justify-between gap-2 mb-2">
            <h4 className="text-sm font-semibold text-slate-200 leading-snug flex-1">
              {task.title}
            </h4>
            <button
              onClick={(e) => {
                e.stopPropagation()
                onDelete?.(task.id)
              }}
              className="opacity-0 group-hover:opacity-100 text-slate-600 hover:text-red-400 transition-all p-1 rounded-md hover:bg-red-500/10"
              title="Delete Task"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2 mb-2">
            <span
              className={cn(
                'text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md border',
                priorityColors[task.priority]
              )}
            >
              {task.priority}
            </span>
            <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider bg-slate-800/50 px-2 py-0.5 rounded-md">
              {task.type}
            </span>
            {task.status && task.status !== 'queued' && (
              <span
                className={cn(
                  'text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md border',
                  statusColors[task.status]
                )}
              >
                {task.status}
              </span>
            )}
            {isBlocked && (
              <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md border bg-red-500/10 text-red-400 border-red-500/20 flex items-center gap-1">
                <AlertCircle className="w-3 h-3" />
                Blocked
              </span>
            )}
          </div>

          {task.tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-1">
              {task.tags.slice(0, 3).map((tag, i) => (
                <span
                  key={i}
                  className="text-[10px] text-slate-400 bg-slate-800/80 px-2 py-0.5 rounded border border-slate-700/50"
                >
                  {tag}
                </span>
              ))}
              {task.tags.length > 3 && (
                <span className="text-[10px] text-slate-500 font-medium">
                  +{task.tags.length - 3}
                </span>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

interface SortableColumnProps {
  id: string
  name: string
  color: string
  tasks: KanbanTask[]
  onAddTask: () => void
  onDeleteTask: (id: string) => void
  onTaskClick?: (task: KanbanTask) => void
  onEdit: () => void
  onDelete: () => void
}

function SortableColumn({
  id,
  name,
  color,
  tasks,
  onAddTask,
  onDeleteTask,
  onTaskClick,
  onEdit,
  onDelete,
}: SortableColumnProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: id,
    data: {
      type: 'column',
    },
  })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  return (
    <div
      ref={setNodeRef}
      style={{
        ...style,
        borderColor: color ? `${color}40` : undefined,
        boxShadow: color ? `0 0 25px -10px ${color}20` : undefined,
        backgroundColor: color ? `color-mix(in srgb, ${color} 3%, #0B0E14)` : '#0B0E14',
      }}
      className={cn(
        'flex-shrink-0 w-80 rounded-2xl border flex flex-col max-h-full transition-all duration-300',
        !color && 'border-slate-800/50',
        isDragging && 'opacity-50'
      )}
    >
      <div className="p-4 border-b border-slate-800/50">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <button
              {...attributes}
              {...listeners}
              className="text-slate-600 hover:text-slate-300 transition-colors shrink-0 p-2 hover:bg-slate-800/50 rounded-lg -ml-1"
            >
              <GripVertical className="w-5 h-5" />
            </button>
            <h3
              className="text-sm font-bold text-slate-200 truncate cursor-pointer hover:text-blue-400 transition-colors px-1"
              onClick={onEdit}
            >
              {name}
            </h3>
            <span className="text-xs text-slate-500 bg-slate-800/50 px-2 py-0.5 rounded-full shrink-0">
              {tasks.length}
            </span>
          </div>
          <div className="flex items-center gap-1 shrink-0 ml-2">
            <button
              onClick={onEdit}
              className="text-slate-600 hover:text-blue-400 transition-colors p-1"
              title="Edit Column"
            >
              <Edit2 className="w-4 h-4" />
            </button>
            <button
              onClick={onDelete}
              className="text-slate-600 hover:text-red-400 transition-colors p-1"
              title="Delete Column"
            >
              <Trash2 className="w-4 h-4" />
            </button>
            <button
              onClick={onAddTask}
              className="text-slate-600 hover:text-blue-400 hover:bg-blue-400/10 transition-colors p-1"
              title="Quick Add Task"
            >
              <Plus className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar p-3">
        <SortableContext items={tasks} strategy={verticalListSortingStrategy}>
          {tasks.length === 0 ? (
            <div className="text-center py-12 text-slate-600">
              <div className="w-10 h-10 bg-slate-800/50 rounded-xl flex items-center justify-center mx-auto mb-3">
                <AlertCircle className="w-5 h-5" />
              </div>
              <p className="text-sm">No tasks yet</p>
              <p className="text-xs mt-1">Click + to add a task</p>
            </div>
          ) : (
            tasks.map((task) => (
              <SortableTask
                key={task.id}
                task={task}
                onDelete={onDeleteTask}
                onClick={onTaskClick}
              />
            ))
          )}
        </SortableContext>
      </div>
    </div>
  )
}

const COLUMN_COLORS = [
  { name: 'Blue', value: '#3B82F6', bg: 'bg-blue-500', hover: 'hover:bg-blue-400' },
  { name: 'Green', value: '#10B981', bg: 'bg-emerald-500', hover: 'hover:bg-emerald-400' },
  { name: 'Purple', value: '#8B5CF6', bg: 'bg-violet-500', hover: 'hover:bg-violet-400' },
  { name: 'Red', value: '#EF4444', bg: 'bg-red-500', hover: 'hover:bg-red-400' },
  { name: 'Orange', value: '#F59E0B', bg: 'bg-amber-500', hover: 'hover:bg-amber-400' },
  { name: 'Cyan', value: '#06B6D4', bg: 'bg-cyan-500', hover: 'hover:bg-cyan-400' },
  { name: 'Pink', value: '#EC4899', bg: 'bg-pink-500', hover: 'hover:bg-pink-400' },
  { name: 'Teal', value: '#14B8A6', bg: 'bg-teal-500', hover: 'hover:bg-teal-400' },
  { name: 'Indigo', value: '#6366F1', bg: 'bg-indigo-500', hover: 'hover:bg-indigo-400' },
  { name: 'Yellow', value: '#EAB308', bg: 'bg-yellow-500', hover: 'hover:bg-yellow-400' },
  { name: 'Rose', value: '#F43F5E', bg: 'bg-rose-500', hover: 'hover:bg-rose-400' },
  { name: 'Sky', value: '#0EA5E9', bg: 'bg-sky-500', hover: 'hover:bg-sky-400' },
]

interface ColumnModalProps {
  isOpen: boolean
  onClose: () => void
  onSubmit: (name: string, color: string) => void
  initialData?: { name: string; color: string }
  title: string
}

function ColumnModal({ isOpen, onClose, onSubmit, initialData, title }: ColumnModalProps) {
  const [name, setName] = useState('')
  const [selectedColor, setSelectedColor] = useState(COLUMN_COLORS[0].value)

  useEffect(() => {
    if (isOpen) {
      setName(initialData?.name || '')
      setSelectedColor(initialData?.color || COLUMN_COLORS[0].value)
    }
  }, [isOpen, initialData])

  if (!isOpen) return null

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return
    onSubmit(name.trim(), selectedColor)
  }

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[100] p-4">
      <div className="bg-[#11151C] border border-slate-800 rounded-2xl p-6 max-w-md w-full shadow-2xl">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-white">{title}</h2>
          <button
            onClick={onClose}
            className="text-slate-500 hover:text-slate-300 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
              Column Name *
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-4 py-3 bg-[#0B0E14] border border-slate-800 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500/50 transition-all"
              placeholder="e.g., To Do, In Progress, Done"
              autoFocus
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
              Pick Column Color
            </label>
            <div className="grid grid-cols-6 gap-3">
              {COLUMN_COLORS.map((color) => (
                <button
                  key={color.value}
                  type="button"
                  onClick={() => setSelectedColor(color.value)}
                  className={cn(
                    'aspect-square rounded-xl transition-all relative flex items-center justify-center group',
                    color.bg,
                    color.hover,
                    selectedColor === color.value
                      ? 'ring-2 ring-white ring-offset-2 ring-offset-[#11151C]'
                      : 'opacity-80 hover:opacity-100'
                  )}
                  title={color.name}
                >
                  {selectedColor === color.value && (
                    <div className="w-2.5 h-2.5 bg-white rounded-full shadow-lg" />
                  )}
                  <div className="absolute inset-0 rounded-xl ring-1 ring-inset ring-black/10 group-hover:ring-black/20" />
                </button>
              ))}
            </div>
          </div>
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-3 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl font-semibold text-sm transition-all border border-slate-700/50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!name.trim()}
              className="flex-1 px-4 py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-semibold text-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-blue-600/20"
            >
              {initialData ? 'Save Changes' : 'Add Column'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

interface QuickAddTaskModalProps {
  isOpen: boolean
  onClose: () => void
  onSubmit: (task: Omit<CreateTaskInput, 'boardId' | 'projectId'>) => void
  columnName?: string
}

function QuickAddTaskModal({ isOpen, onClose, onSubmit, columnName }: QuickAddTaskModalProps) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [priority, setPriority] = useState<'postpone' | 'low' | 'normal' | 'urgent'>('normal')
  const [type, setType] = useState('task')
  const [selectedTags, setSelectedTags] = useState<string[]>([])
  const [globalTags, setGlobalTags] = useState<Tag[]>([])
  const [isPickerOpen, setIsPickerOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')

  useEffect(() => {
    if (isOpen) {
      loadGlobalTags()
    }
  }, [isOpen])

  const loadGlobalTags = async () => {
    try {
      const response = await window.api.tag.list({})
      setGlobalTags(response.tags)
    } catch (error) {
      console.error('Failed to load global tags:', error)
    }
  }

  if (!isOpen) return null

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim()) return

    onSubmit({
      title: title.trim(),
      description: description.trim() || undefined,
      priority,
      type,
      difficulty: 'medium',
      tags: selectedTags,
      columnId: '',
    })
    setTitle('')
    setDescription('')
    setSelectedTags([])
    setPriority('normal')
    setType('task')
  }

  const toggleTag = (tagName: string) => {
    setSelectedTags((prev) =>
      prev.includes(tagName) ? prev.filter((t) => t !== tagName) : [...prev, tagName]
    )
  }

  const filteredTags = globalTags.filter((tag) =>
    tag.name.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const getTagColor = (tagName: string) => {
    return globalTags.find((t) => t.name === tagName)?.color || '#475569'
  }

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[100] p-4">
      <div className="bg-[#11151C] border border-slate-800 rounded-2xl p-6 max-w-md w-full shadow-2xl">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-white">
            Quick Add Task{' '}
            {columnName && <span className="text-slate-400 font-normal ml-2">→ {columnName}</span>}
          </h2>
          <button
            onClick={onClose}
            className="text-slate-500 hover:text-slate-300 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
              Title *
            </label>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-4 py-3 bg-[#0B0E14] border border-slate-800 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500/50 transition-all"
              placeholder="What needs to be done?"
              autoFocus
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
              Description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-4 py-3 bg-[#0B0E14] border border-slate-800 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500/50 transition-all resize-none h-20"
              placeholder="Add details..."
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                Priority
              </label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as any)}
                className="w-full px-4 py-3 bg-[#0B0E14] border border-slate-800 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500/50 transition-all text-sm"
              >
                <option value="postpone">Postpone</option>
                <option value="low">Low</option>
                <option value="normal">Normal</option>
                <option value="urgent">Urgent</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                Type
              </label>
              <input
                type="text"
                value={type}
                onChange={(e) => setType(e.target.value)}
                className="w-full px-4 py-3 bg-[#0B0E14] border border-slate-800 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500/50 transition-all text-sm"
                placeholder="task, bug, feature"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
              Tags
            </label>
            <div className="flex flex-wrap gap-2 mb-3 min-h-[32px] p-2 bg-[#0B0E14] border border-slate-800 rounded-xl">
              {selectedTags.length === 0 && (
                <span className="text-slate-600 text-xs italic px-1">No tags selected</span>
              )}
              {selectedTags.map((tagName) => (
                <span
                  key={tagName}
                  className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[10px] font-semibold bg-slate-800/80 text-white border border-slate-700/50 group transition-all"
                  style={{ borderLeftColor: getTagColor(tagName), borderLeftWidth: '3px' }}
                >
                  {tagName}
                  <button
                    type="button"
                    onClick={() => toggleTag(tagName)}
                    className="p-0.5 hover:bg-white/10 rounded-sm text-slate-500 hover:text-red-400 transition-colors"
                  >
                    <X className="w-2.5 h-2.5" />
                  </button>
                </span>
              ))}
            </div>

            <div className="relative">
              <button
                type="button"
                onClick={() => setIsPickerOpen(!isPickerOpen)}
                className={cn(
                  'w-full flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-xs font-medium border transition-all',
                  isPickerOpen
                    ? 'bg-blue-500/10 text-blue-400 border-blue-500/50'
                    : 'bg-slate-800/40 text-slate-400 border-slate-800 hover:text-blue-400 hover:border-blue-500/50'
                )}
              >
                <Plus className="w-3 h-3" />
                {isPickerOpen ? 'Close Tag Picker' : 'Select Tags'}
              </button>

              {isPickerOpen && (
                <div className="absolute left-0 bottom-full mb-2 w-full bg-[#161B26] border border-slate-800 rounded-xl shadow-2xl z-20 py-2 animate-in fade-in slide-in-from-bottom-2 duration-200">
                  <div className="px-3 pb-2 border-b border-slate-800 mb-1">
                    <div className="relative">
                      <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-500" />
                      <input
                        autoFocus
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Search tags..."
                        className="w-full bg-[#0B0E14] border border-slate-800 text-[10px] text-white pl-7 pr-2 py-1.5 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500/50"
                      />
                    </div>
                  </div>
                  <div className="max-h-40 overflow-y-auto px-1 py-1 custom-scrollbar">
                    {filteredTags.length === 0 ? (
                      <div className="px-3 py-4 text-center text-[10px] text-slate-500 italic">
                        No tags found.
                      </div>
                    ) : (
                      filteredTags.map((tag) => {
                        const isSelected = selectedTags.includes(tag.name)
                        return (
                          <button
                            key={tag.id}
                            type="button"
                            onClick={() => toggleTag(tag.name)}
                            className={cn(
                              'w-full flex items-center justify-between px-3 py-1.5 rounded-lg text-xs transition-all group',
                              isSelected
                                ? 'bg-blue-500/10 text-blue-400'
                                : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                            )}
                          >
                            <div className="flex items-center gap-2">
                              <div
                                className="w-2 h-2 rounded-full"
                                style={{ backgroundColor: tag.color }}
                              />
                              {tag.name}
                            </div>
                            {isSelected && <Check className="w-3 h-3" />}
                          </button>
                        )
                      })
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-3 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl font-semibold text-sm transition-all border border-slate-700/50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!title.trim()}
              className="flex-1 px-4 py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-semibold text-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-blue-600/20"
            >
              Add Task
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export function BoardScreen({ projectId }: BoardScreenProps) {
  const [board, setBoard] = useState<Board | null>(null)
  const [tasks, setTasks] = useState<KanbanTask[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeTask, setActiveTask] = useState<KanbanTask | null>(null)
  const [activeColumn, setActiveColumn] = useState<string | null>(null)
  const [selectedTask, setSelectedTask] = useState<KanbanTask | null>(null)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [quickAddModalOpen, setQuickAddModalOpen] = useState(false)
  const [quickAddColumnId, setQuickAddColumnId] = useState<string | null>(null)
  const [isColumnModalOpen, setIsColumnModalOpen] = useState(false)
  const [editingColumnId, setEditingColumnId] = useState<string | null>(null)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  useEffect(() => {
    loadBoard()
  }, [projectId])

  useEffect(() => {
    const unsubscribe = window.api.task.onEvent((event) => {
      if (event.type !== 'task.updated') return
      setTasks((prev) => {
        const index = prev.findIndex((task) => task.id === event.task.id)
        if (index === -1) return prev
        const next = [...prev]
        next[index] = event.task
        return next
      })

      setSelectedTask((prev) => (prev?.id === event.task.id ? event.task : prev))
      setActiveTask((prev) => (prev?.id === event.task.id ? event.task : prev))
    })

    return () => {
      unsubscribe()
    }
  }, [])

  const normalizeColumns = (
    columns: Array<{ id?: BoardColumn['id']; name: BoardColumn['name']; color?: string }>
  ): BoardColumnInput[] =>
    columns.map((col, index) => ({
      id: col.id,
      name: col.name,
      orderIndex: index,
      color: col.color || '',
    }))

  const loadBoard = async () => {
    try {
      setLoading(true)
      setError(null)
      const { board, columns } = await window.api.board.getDefault({ projectId })
      setBoard({ ...board, columns })
      const { tasks } = await window.api.task.listByBoard({ boardId: board.id })
      setTasks(tasks)
    } catch (error) {
      console.error('Failed to load board:', error)
      setError(error instanceof Error ? error.message : 'An unknown error occurred')
    } finally {
      setLoading(false)
    }
  }

  const handleDragStart = (event: DragStartEvent) => {
    if (event.active.data.current?.type === 'task') {
      setActiveTask(tasks.find((t) => t.id === event.active.id) || null)
    } else {
      setActiveColumn(event.active.id as string)
    }
  }

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event
    setActiveTask(null)
    setActiveColumn(null)
    if (!over || !board) return
    const activeId = active.id as string
    const overId = over.id as string
    const columns = board.columns || []
    const isColumn = columns.some((c) => c.id === activeId)

    if (isColumn) {
      const oldIndex = columns.findIndex((c) => c.id === activeId)
      const newIndex = columns.findIndex((c) => c.id === overId)
      if (oldIndex !== newIndex) {
        const movedColumns = arrayMove(columns, oldIndex, newIndex).map((col, index) => ({
          ...col,
          orderIndex: index,
        }))
        setBoard({ ...board, columns: movedColumns })
        const response = await window.api.board.updateColumns({
          boardId: board.id,
          columns: normalizeColumns(movedColumns),
        })
        setBoard({ ...board, columns: response.columns })
      }
      return
    }

    const activeTask = tasks.find((t) => t.id === activeId)
    const overTask = tasks.find((t) => t.id === overId)
    if (!activeTask) return
    const activeColumnId = activeTask.columnId
    let overColumnId = overTask?.columnId || activeColumnId
    const targetColumn = board.columns?.find((c) => c.id === overId)
    if (targetColumn) {
      overColumnId = targetColumn.id
    }

    if (activeColumnId === overColumnId) {
      const filtered = tasks.filter((t) => t.columnId === activeColumnId)
      const oldIndex = filtered.findIndex((t) => t.id === activeId)
      const newIndex = filtered.findIndex((t) => t.id === overId)
      if (oldIndex !== newIndex && overTask) {
        await window.api.task.move({
          taskId: activeId,
          toColumnId: activeColumnId,
          toIndex: newIndex,
        })
        loadBoard()
      }
    } else {
      const newIndex = tasks.filter((t) => t.columnId === overColumnId).length
      await window.api.task.move({ taskId: activeId, toColumnId: overColumnId, toIndex: newIndex })
      loadBoard()
    }
  }

  const handleAddTask = async (columnId: string) => {
    if (!board) return

    try {
      const response = await window.api.task.create({
        boardId: board.id,
        columnId,
        title: 'New',
        priority: 'normal',
        difficulty: 'medium',
        type: 'feature',
        projectId,
        tags: [],
      })

      setSelectedTask(response.task)
      setDrawerOpen(true)

      loadBoard()
    } catch (error) {
      console.error('Failed to create draft task:', error)
    }
  }

  const handleQuickAddSubmit = async (taskData: Omit<CreateTaskInput, 'boardId' | 'projectId'>) => {
    if (!board || !quickAddColumnId) return
    try {
      await window.api.task.create({
        ...taskData,
        columnId: quickAddColumnId,
        projectId,
        boardId: board.id,
        difficulty: 'medium',
      })
      setQuickAddModalOpen(false)
      setQuickAddColumnId(null)
      loadBoard()
    } catch (error) {
      console.error('Failed to create task:', error)
    }
  }

  const handleDeleteTask = async (taskId: string) => {
    if (!confirm('Are you sure you want to delete this task?')) return
    try {
      await window.api.task.delete({ taskId })
      loadBoard()
    } catch (error) {
      console.error('Failed to delete task:', error)
    }
  }

  const handleColumnSubmit = async (name: string, color: string) => {
    if (!board) return
    if (editingColumnId) {
      const currentColumns = (board.columns || []).map((col) =>
        col.id === editingColumnId
          ? { ...col, name: name.trim(), color }
          : { id: col.id, name: col.name, color: col.color, orderIndex: col.orderIndex }
      )
      setBoard({
        ...board,
        columns: board.columns?.map((c) =>
          c.id === editingColumnId ? { ...c, name: name.trim(), color } : c
        ),
      })
      const response = await window.api.board.updateColumns({
        boardId: board.id,
        columns: normalizeColumns(currentColumns),
      })
      setBoard({ ...board, columns: response.columns })
    } else {
      const currentColumns = (board.columns || []).map(({ id, name, color }) => ({
        id,
        name,
        color,
      }))
      const newColumns = [...currentColumns, { name: name.trim(), color }]
      setBoard({
        ...board,
        columns: [
          ...(board.columns || []),
          {
            id: 'temp-' + Date.now(),
            boardId: board.id,
            name: name.trim(),
            color,
            orderIndex: (board.columns || []).length,
          },
        ],
      })
      const response = await window.api.board.updateColumns({
        boardId: board.id,
        columns: normalizeColumns(newColumns),
      })
      setBoard({ ...board, columns: response.columns })
    }
    setIsColumnModalOpen(false)
    setEditingColumnId(null)
  }

  const handleDeleteColumn = async (columnId: string) => {
    if (!board) return
    if (tasks.filter((t) => t.columnId === columnId).length > 0) {
      alert('Cannot delete column with tasks.')
      return
    }
    if (!confirm('Are you sure you want to delete this column?')) return
    const newColumns = (board.columns || [])
      .filter((col) => col.id !== columnId)
      .map(({ id, name, color }) => ({ id, name, color }))
    try {
      const response = await window.api.board.updateColumns({
        boardId: board.id,
        columns: normalizeColumns(newColumns),
      })
      setBoard({ ...board, columns: response.columns })
    } catch (error) {
      console.error('Failed to delete column:', error)
    }
  }

  if (loading)
    return (
      <div className="h-full flex items-center justify-center animate-pulse">
        <Clock className="w-8 h-8 text-blue-400 animate-spin" />
      </div>
    )
  if (error || !board)
    return (
      <div className="h-full flex items-center justify-center text-red-400">
        <AlertCircle className="w-8 h-8 mr-2" /> {error || 'Board not found'}
      </div>
    )

  const columns = board.columns || []

  return (
    <>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <div className="h-full flex flex-col overflow-hidden">
          <div className="flex items-center justify-between mb-6 shrink-0">
            <div>
              <h1 className="text-2xl font-bold text-white">{board.name}</h1>
              <p className="text-slate-500 text-sm mt-1">
                {tasks.length} tasks across {columns.length} columns
              </p>
            </div>
            <button
              disabled
              className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-blue-600 to-cyan-600 text-white text-sm font-semibold rounded-xl opacity-50 cursor-not-allowed shadow-lg"
            >
              <Play className="w-4 h-4" /> <span>Start Run</span>
            </button>
          </div>
          <div className="flex-1 overflow-x-auto overflow-y-hidden custom-scrollbar -mr-6 pr-6">
            {columns.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center text-center p-8 bg-[#0B0E14] rounded-2xl border border-dashed border-slate-800/50 min-h-[400px]">
                <AlertCircle className="w-12 h-12 text-slate-500 mb-4" />
                <h3 className="text-xl font-bold text-white mb-2">No columns yet</h3>
                <button
                  onClick={() => setIsColumnModalOpen(true)}
                  className="mt-4 flex items-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-xl shadow-lg"
                >
                  <Plus className="w-5 h-5" /> <span>Add First Column</span>
                </button>
              </div>
            ) : (
              <SortableContext
                items={columns.map((c) => c.id)}
                strategy={horizontalListSortingStrategy}
              >
                <div className="flex gap-4 h-full p-1">
                  {columns.map((column) => (
                    <SortableColumn
                      key={column.id}
                      id={column.id}
                      name={column.name}
                      color={column.color || ''}
                      tasks={tasks
                        .filter((t) => t.columnId === column.id)
                        .sort((a, b) => (a.orderInColumn || 0) - (b.orderInColumn || 0))}
                      onAddTask={() => handleAddTask(column.id)}
                      onDeleteTask={handleDeleteTask}
                      onTaskClick={(task) => {
                        setSelectedTask(task)
                        setDrawerOpen(true)
                      }}
                      onEdit={() => {
                        setEditingColumnId(column.id)
                        setIsColumnModalOpen(true)
                      }}
                      onDelete={() => handleDeleteColumn(column.id)}
                    />
                  ))}
                  <div className="flex-shrink-0 w-80">
                    <button
                      onClick={() => {
                        setEditingColumnId(null)
                        setIsColumnModalOpen(true)
                      }}
                      className="w-full h-14 bg-[#0B0E14]/50 hover:bg-[#0B0E14] border border-dashed border-slate-800/50 hover:border-slate-700 rounded-2xl flex items-center justify-center gap-2 text-slate-500 hover:text-slate-300 transition-all"
                    >
                      <Plus className="w-5 h-5" />{' '}
                      <span className="font-semibold text-sm">Add Column</span>
                    </button>
                  </div>
                </div>
              </SortableContext>
            )}
          </div>
        </div>
        <DragOverlay>
          {activeTask && (
            <div className="bg-[#11151C] border border-slate-700 rounded-xl p-4 shadow-2xl rotate-3 scale-105">
              <h4 className="text-sm font-semibold text-white">{activeTask.title}</h4>
            </div>
          )}
          {activeColumn && (
            <div className="bg-[#11151C] border-2 border-blue-500 rounded-2xl w-80 shadow-2xl rotate-2 opacity-90 p-4">
              <h3 className="text-sm font-bold text-white">
                {columns.find((c) => c.id === activeColumn)?.name}
              </h3>
            </div>
          )}
        </DragOverlay>
      </DndContext>
      <QuickAddTaskModal
        isOpen={quickAddModalOpen}
        onClose={() => {
          setQuickAddModalOpen(false)
          setQuickAddColumnId(null)
        }}
        onSubmit={handleQuickAddSubmit}
        columnName={columns.find((c) => c.id === quickAddColumnId)?.name}
      />
      <ColumnModal
        isOpen={isColumnModalOpen}
        onClose={() => {
          setIsColumnModalOpen(false)
          setEditingColumnId(null)
        }}
        onSubmit={handleColumnSubmit}
        initialData={editingColumnId ? columns.find((c) => c.id === editingColumnId) : undefined}
        title={editingColumnId ? 'Edit Column' : 'Add New Column'}
      />
      <TaskDrawer
        task={selectedTask}
        isOpen={drawerOpen}
        onClose={() => {
          setDrawerOpen(false)
          setSelectedTask(null)
        }}
        columnName={board?.columns?.find((c) => c.id === selectedTask?.columnId)?.name}
        onUpdate={async (taskId, patch) => {
          await window.api.task.update({ taskId, patch })
          setTasks((prev) =>
            prev.map((t) =>
              t.id === taskId ? { ...t, ...patch, updatedAt: new Date().toISOString() } : t
            )
          )
          if (selectedTask?.id === taskId) {
            setSelectedTask((prev) =>
              prev ? { ...prev, ...patch, updatedAt: new Date().toISOString() } : null
            )
          }
        }}
      />
    </>
  )
}
