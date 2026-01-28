import { useState, useEffect } from 'react'
import {
  DndContext,
  DragOverlay,
  closestCorners,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragStartEvent,
  DragEndEvent
} from '@dnd-kit/core'
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  horizontalListSortingStrategy,
  verticalListSortingStrategy,
  useSortable
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import {
  GripVertical,
  Plus,
  ChevronDown,
  ChevronUp,
  X,
  AlertCircle,
  Clock,
  Play
} from 'lucide-react'
import type { Board, KanbanTask, CreateTaskInput } from '../../shared/types/ipc'
import { cn } from '../lib/utils'
import { TaskDrawer } from '../components/kanban/TaskDrawer'

interface BoardScreenProps {
  projectId: string
}

interface SortableTaskProps {
  task: KanbanTask
  onDelete?: (id: string) => void
  onClick?: (task: KanbanTask) => void
}

function SortableTask({ task, onDelete, onClick }: SortableTaskProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({ id: task.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  const priorityColors = {
    low: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    medium: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
    high: 'bg-orange-500/10 text-orange-400 border-orange-500/20',
    urgent: 'bg-red-500/10 text-red-400 border-red-500/20'
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      onClick={() => onClick?.(task)}
      className={cn(
        "bg-[#11151C] border border-slate-800/50 rounded-xl p-4 mb-3 group hover:border-slate-700/50 hover:border-blue-500/30 transition-all cursor-grab active:cursor-grabbing",
        isDragging && "opacity-50 shadow-2xl"
      )}
    >
      <div className="flex items-start gap-3">
        <button
          {...attributes}
          {...listeners}
          className="mt-1 text-slate-600 hover:text-slate-400 transition-colors"
        >
          <GripVertical className="w-4 h-4" />
        </button>

        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2 mb-2">
            <h4 className="text-sm font-semibold text-slate-200 leading-snug flex-1">
              {task.title}
            </h4>
            <button
              onClick={(e) => {
                e.stopPropagation()
                onDelete?.(task.id)
              }}
              className="opacity-0 group-hover:opacity-100 text-slate-600 hover:text-red-400 transition-all"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="flex items-center gap-2 mb-2">
            <span className={cn(
              "text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border",
              priorityColors[task.priority]
            )}>
              {task.priority}
            </span>
            <span className="text-[10px] text-slate-500 uppercase tracking-wider">
              {task.type}
            </span>
          </div>

          {task.tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {task.tags.slice(0, 3).map((tag, i) => (
                <span
                  key={i}
                  className="text-[10px] text-slate-400 bg-slate-800/50 px-2 py-0.5 rounded-md"
                >
                  {tag}
                </span>
              ))}
              {task.tags.length > 3 && (
                <span className="text-[10px] text-slate-500">
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
  tasks: KanbanTask[]
  onAddTask: () => void
  onDeleteTask: (id: string) => void
  onTaskClick?: (task: KanbanTask) => void
}

function SortableColumn({ id, name, tasks, onAddTask, onDeleteTask, onTaskClick }: SortableColumnProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({ id: id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  const [isCollapsed, setIsCollapsed] = useState(false)

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "flex-shrink-0 w-80 bg-[#0B0E14] rounded-2xl border border-slate-800/50 flex flex-col max-h-full",
        isDragging && "opacity-50"
      )}
    >
      <div className="p-4 border-b border-slate-800/50">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button
              {...attributes}
              {...listeners}
              className="text-slate-600 hover:text-slate-400 transition-colors"
            >
              <GripVertical className="w-4 h-4" />
            </button>
            <h3 className="text-sm font-bold text-slate-200">{name}</h3>
            <span className="text-xs text-slate-500 bg-slate-800/50 px-2 py-0.5 rounded-full">
              {tasks.length}
            </span>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setIsCollapsed(!isCollapsed)}
              className="text-slate-600 hover:text-slate-400 transition-colors p-1"
            >
              {isCollapsed ? (
                <ChevronUp className="w-4 h-4" />
              ) : (
                <ChevronDown className="w-4 h-4" />
              )}
            </button>
            <button
              onClick={onAddTask}
              className="text-slate-600 hover:text-blue-400 hover:bg-blue-400/10 transition-colors p-1"
              title="Quick Add Task"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      <div className={cn(
        "flex-1 overflow-y-auto custom-scrollbar p-3",
        isCollapsed && "hidden"
      )}>
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
              <SortableTask key={task.id} task={task} onDelete={onDeleteTask} onClick={onTaskClick} />
            ))
          )}
        </SortableContext>
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
  const [priority, setPriority] = useState<'low' | 'medium' | 'high' | 'urgent'>('medium')
  const [type, setType] = useState('task')
  const [tags, setTags] = useState('')

  if (!isOpen) return null

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim()) return

    const tagArray = tags
      .split(',')
      .map(t => t.trim())
      .filter(t => t.length > 0)

    onSubmit({
      title: title.trim(),
      description: description.trim() || undefined,
      priority,
      type,
      tags: tagArray,
      columnId: ''
    })

    setTitle('')
    setDescription('')
    setTags('')
    setPriority('medium')
    setType('task')
  }

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[100] p-4">
      <div className="bg-[#11151C] border border-slate-800 rounded-2xl p-6 max-w-md w-full shadow-2xl">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-white">
            Quick Add Task
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
                className="w-full px-4 py-3 bg-[#0B0E14] border border-slate-800 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500/50 transition-all"
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
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
                className="w-full px-4 py-3 bg-[#0B0E14] border border-slate-800 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500/50 transition-all"
                placeholder="task, bug, feature"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
              Tags (comma separated)
            </label>
            <input
              type="text"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              className="w-full px-4 py-3 bg-[#0B0E14] border border-slate-800 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500/50 transition-all"
              placeholder="frontend, api, critical"
            />
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
  const [activeTask, setActiveTask] = useState<KanbanTask | null>(null)
  const [activeColumn, setActiveColumn] = useState<string | null>(null)
  const [selectedTask, setSelectedTask] = useState<KanbanTask | null>(null)
  const [drawerOpen, setDrawerOpen] = useState(false)

  const [quickAddModalOpen, setQuickAddModalOpen] = useState(false)
  const [quickAddColumnId, setQuickAddColumnId] = useState<string | null>(null)

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  )

  useEffect(() => {
    loadBoard()
  }, [projectId])

  const loadBoard = async () => {
    try {
      setLoading(true)
      const boardData = await window.api.board.getDefault(projectId)
      setBoard(boardData)

      const tasksData = await window.api.task.listByBoard(boardData.id)
      setTasks(tasksData)
    } catch (error) {
      console.error('Failed to load board:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleDragStart = (event: DragStartEvent) => {
    if (event.active.data.current?.type === 'task') {
      setActiveTask(tasks.find(t => t.id === event.active.id) || null)
    } else {
      setActiveColumn(event.active.id as string)
    }
  }

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event
    setActiveTask(null)
    setActiveColumn(null)

    if (!over) return

    const activeId = active.id as string
    const overId = over.id as string

    if (!board) return

    const columns = board.columns || []
    const isColumn = columns.some(c => c.id === activeId)

    if (isColumn) {
      const oldIndex = columns.findIndex(c => c.id === activeId)
      const newIndex = columns.findIndex(c => c.id === overId)

      if (oldIndex !== newIndex) {
        const newColumns = arrayMove(columns, oldIndex, newIndex)
        setBoard({ ...board, columns: newColumns })

        await window.api.board.updateColumns(board.id, newColumns)
      }
      return
    }

    const activeTask = tasks.find(t => t.id === activeId)
    const overTask = tasks.find(t => t.id === overId)

    if (!activeTask) return

    const activeColumnId = activeTask.columnId
    let overColumnId = overTask?.columnId || activeColumnId

    const targetColumn = board.columns?.find(c => c.id === overId)
    if (targetColumn) {
      overColumnId = targetColumn.id
    }

    if (activeColumnId === overColumnId) {
      const oldIndex = tasks
        .filter(t => t.columnId === activeColumnId)
        .findIndex(t => t.id === activeId)
      const newIndex = tasks
        .filter(t => t.columnId === activeColumnId)
        .findIndex(t => t.id === overId)

      if (oldIndex !== newIndex && overTask) {
        await window.api.task.move(activeId, activeColumnId, newIndex)
        loadBoard()
      }
    } else {
      const tasksInNewColumn = tasks.filter(t => t.columnId === overColumnId)
      const newIndex = tasksInNewColumn.length

      await window.api.task.move(activeId, overColumnId, newIndex)
      loadBoard()
    }
  }

  const handleAddTask = (columnId: string) => {
    setQuickAddColumnId(columnId)
    setQuickAddModalOpen(true)
  }

  const handleQuickAddSubmit = async (taskData: Omit<CreateTaskInput, 'boardId' | 'projectId'>) => {
    if (!board || !quickAddColumnId) return

    try {
      await window.api.task.create({
        ...taskData,
        columnId: quickAddColumnId,
        projectId,
        boardId: board.id
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
      await window.api.task.update(taskId, { deletedAt: new Date().toISOString() })
      loadBoard()
    } catch (error) {
      console.error('Failed to delete task:', error)
    }
  }

  const handleTaskClick = (task: KanbanTask) => {
    setSelectedTask(task)
    setDrawerOpen(true)
  }

  const handleDrawerClose = () => {
    setDrawerOpen(false)
    setSelectedTask(null)
  }

  const handleTaskUpdate = async (taskId: string, patch: Partial<KanbanTask>) => {
    try {
      await window.api.task.update(taskId, patch)
      loadBoard()
    } catch (error) {
      console.error('Failed to update task:', error)
    }
  }

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="w-12 h-12 bg-blue-600/10 rounded-xl flex items-center justify-center mx-auto animate-pulse">
            <Clock className="w-6 h-6 text-blue-400 animate-spin" />
          </div>
          <p className="text-slate-500">Loading board...</p>
        </div>
      </div>
    )
  }

  if (!board) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="w-12 h-12 bg-red-500/10 rounded-xl flex items-center justify-center mx-auto">
            <AlertCircle className="w-6 h-6 text-red-400" />
          </div>
          <p className="text-slate-400">Board not found</p>
        </div>
      </div>
    )
  }

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
                {tasks.length} task{tasks.length !== 1 ? 's' : ''} across {columns.length} column{columns.length !== 1 ? 's' : ''}
              </p>
            </div>
            <button
              disabled
              className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 text-white text-sm font-semibold rounded-xl transition-all shadow-lg shadow-blue-600/20 disabled:opacity-50 disabled:cursor-not-allowed group relative"
              title="AI Automation coming in Phase 2"
            >
              <Play className="w-4 h-4" />
              <span>Start Run</span>
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-1.5 bg-slate-800 text-slate-300 text-xs rounded-lg whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none border border-slate-700 shadow-lg">
                AI Automation coming in Phase 2
                <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-1 border-4 border-transparent border-t-slate-800" />
              </div>
            </button>
          </div>

          <div className="flex-1 overflow-x-auto overflow-y-hidden custom-scrollbar">
            <SortableContext items={columns.map(c => c.id)} strategy={horizontalListSortingStrategy}>
              <div className="flex gap-4 h-full p-1">
                {columns.map((column) => {
                  const columnTasks = tasks
                    .filter(t => t.columnId === column.id)
                    .sort((a, b) => a.orderInColumn - b.orderInColumn)

                  return (
                    <SortableColumn
                      key={column.id}
                      id={column.id}
                      name={column.name}
                      tasks={columnTasks}
                      onAddTask={() => handleAddTask(column.id)}
                      onDeleteTask={handleDeleteTask}
                      onTaskClick={handleTaskClick}
                    />
                  )
                })}
              </div>
            </SortableContext>
          </div>
        </div>

        <DragOverlay>
          {activeTask && (
            <div className="bg-[#11151C] border-2 border-blue-500 rounded-xl p-4 shadow-2xl rotate-3 cursor-grabbing">
              <div className="flex items-start gap-3">
                <GripVertical className="w-4 h-4 text-slate-600 mt-1" />
                <div>
                  <h4 className="text-sm font-semibold text-white">{activeTask.title}</h4>
                  <div className="flex items-center gap-2 mt-2">
                    <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border bg-slate-700 text-slate-300">
                      {activeTask.priority}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}
          {activeColumn && (
            <div className="bg-[#11151C] border-2 border-blue-500 rounded-2xl w-80 shadow-2xl rotate-2">
              <div className="p-4 border-b border-blue-500/30">
                <div className="flex items-center gap-2">
                  <GripVertical className="w-4 h-4 text-blue-400" />
                  <h3 className="text-sm font-bold text-white">
                    {columns.find(c => c.id === activeColumn)?.name}
                  </h3>
                </div>
              </div>
              <div className="h-32 flex items-center justify-center">
                <p className="text-sm text-slate-500">Dropping column...</p>
              </div>
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
        columnName={columns.find(c => c.id === quickAddColumnId)?.name}
      />

      <TaskDrawer
        task={selectedTask}
        isOpen={drawerOpen}
        onClose={handleDrawerClose}
        onUpdate={handleTaskUpdate}
      />
    </>
  )
}
