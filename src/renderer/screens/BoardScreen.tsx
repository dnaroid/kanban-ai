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
} from '@dnd-kit/sortable'
import { AlertCircle, Clock, Plus } from 'lucide-react'
import type { Board, BoardColumn, BoardColumnInput, KanbanTask, Tag } from '@/shared/types/ipc.ts'
import { TaskDrawer } from '../components/kanban/TaskDrawer'
import { SortableColumn } from '../components/kanban/board/SortableColumn'
import { SortableTask } from '../components/kanban/board/SortableTask'
import { ColumnModal } from '../components/kanban/board/ColumnModal'

interface BoardScreenProps {
  projectId: string
  projectName: string
}

export function BoardScreen({ projectId }: BoardScreenProps) {
  const [board, setBoard] = useState<Board | null>(null)
  const [tasks, setTasks] = useState<KanbanTask[]>([])
  const [globalTags, setGlobalTags] = useState<Tag[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeTask, setActiveTask] = useState<KanbanTask | null>(null)
  const [activeColumn, setActiveColumn] = useState<string | null>(null)
  const [selectedTask, setSelectedTask] = useState<KanbanTask | null>(null)
  const [drawerOpen, setDrawerOpen] = useState(false)
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

      const [boardData, tagsData] = await Promise.all([
        window.api.board.getDefault({ projectId }),
        window.api.tag.list({}),
      ])

      const { board, columns } = boardData
      setBoard({ ...board, columns })
      setGlobalTags(tagsData.tags)

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
      const filtered = tasks
        .filter((t) => t.columnId === activeColumnId)
        .sort((a, b) => (a.orderInColumn || 0) - (b.orderInColumn || 0))
      const oldIndex = filtered.findIndex((t) => t.id === activeId)
      const newIndex = filtered.findIndex((t) => t.id === overId)
      if (oldIndex !== newIndex && overTask) {
        const updatedTasks = arrayMove(filtered, oldIndex, newIndex)
        updatedTasks.forEach((t, i) => {
          t.orderInColumn = i
        })

        setTasks((prev) => {
          const others = prev.filter((t) => t.columnId !== activeColumnId)
          return [...others, ...updatedTasks]
        })

        await window.api.task.move({
          taskId: activeId,
          toColumnId: activeColumnId,
          toIndex: newIndex,
        })
      }
    } else {
      const newIndex = tasks.filter((t) => t.columnId === overColumnId).length

      setTasks((prev) => {
        return prev.map((t) => {
          if (t.id === activeId) {
            return { ...t, columnId: overColumnId, orderInColumn: newIndex }
          }
          return t
        })
      })

      await window.api.task.move({ taskId: activeId, toColumnId: overColumnId, toIndex: newIndex })
    }
  }

  const handleTaskClick = (task: KanbanTask) => {
    setSelectedTask(task)
    setDrawerOpen(true)
  }

  const handleAddTask = async (columnId: string) => {
    if (!board) return

    try {
      const response = await window.api.task.create({
        boardId: board.id,
        columnId,
        title: 'New Task',
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
    <div className="flex flex-col h-full overflow-hidden">
      <main className="flex-1 overflow-x-auto custom-scrollbar">
        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <div className="inline-flex h-full items-stretch gap-6 pl-8 pt-8 pb-8">
            <SortableContext
              items={columns.map((c) => c.id)}
              strategy={horizontalListSortingStrategy}
            >
              {columns.map((column) => (
                <SortableColumn
                  key={column.id}
                  id={column.id}
                  name={column.name}
                  color={column.color || ''}
                  globalTags={globalTags}
                  tasks={tasks
                    .filter((t) => t.columnId === column.id)
                    .sort((a, b) => (a.orderInColumn || 0) - (b.orderInColumn || 0))}
                  onTaskClick={handleTaskClick}
                  onAddTask={() => handleAddTask(column.id)}
                  onEdit={() => {
                    setEditingColumnId(column.id)
                    setIsColumnModalOpen(true)
                  }}
                  onDelete={() => handleDeleteColumn(column.id)}
                  onDeleteTask={handleDeleteTask}
                />
              ))}
              <div className="flex-shrink-0 w-80 h-full flex flex-col">
                <button
                  onClick={() => {
                    setEditingColumnId(null)
                    setIsColumnModalOpen(true)
                  }}
                  className="w-full h-14 bg-slate-900/40 border border-dashed border-slate-800/50 hover:border-slate-700 rounded-2xl flex items-center justify-center gap-2 text-slate-500 hover:text-slate-300 transition-all shrink-0"
                >
                  <Plus className="w-5 h-5" />{' '}
                  <span className="font-semibold text-sm">Add Column</span>
                </button>
              </div>
            </SortableContext>
          </div>

          <DragOverlay>
            {activeTask ? (
              <div className="w-80 rotate-3 scale-105 pointer-events-none">
                <SortableTask task={activeTask} globalTags={globalTags} />
              </div>
            ) : activeColumn ? (
              <div className="bg-[#11151C]/40 border-2 border-blue-500 rounded-2xl w-80 shadow-2xl rotate-2 opacity-90 p-4 pointer-events-none backdrop-blur-md">
                <h3 className="text-sm font-bold text-white">
                  {columns.find((c) => c.id === activeColumn)?.name}
                </h3>
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      </main>

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
    </div>
  )
}
