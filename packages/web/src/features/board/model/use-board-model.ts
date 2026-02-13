import { useEffect, useState } from 'react'
import type { DragEndEvent, DragStartEvent } from '@dnd-kit/core'
import { KeyboardSensor, PointerSensor, useSensor, useSensors } from '@dnd-kit/core'
import { arrayMove, sortableKeyboardCoordinates } from '@dnd-kit/sortable'
import type { Board, BoardColumn, BoardColumnInput, KanbanTask, Tag } from '@shared/types/ipc.ts'
import {
  createTask,
  deleteTask,
  fetchBoardData,
  fetchGlobalTags,
  fetchTasksByBoard,
  moveTask,
  saveBoardColumns,
  subscribeTaskUpdated,
  updateTask,
} from '../api/board-api'

interface UseBoardModelArgs {
  projectId: string
}

export function useBoardModel({ projectId }: UseBoardModelArgs) {
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
    void loadBoard()
  }, [projectId])

  useEffect(() => {
    const unsubscribe = subscribeTaskUpdated((task) => {
      setTasks((prev) => {
        const index = prev.findIndex((entry) => entry.id === task.id)
        if (index === -1) {
          return prev
        }
        const next = [...prev]
        next[index] = task
        return next
      })

      setSelectedTask((prev) => (prev?.id === task.id ? task : prev))
      setActiveTask((prev) => (prev?.id === task.id ? task : prev))
    })

    return () => {
      unsubscribe()
    }
  }, [])

  const normalizeColumns = (
    columns: Array<{
      id?: BoardColumn['id']
      name: BoardColumn['name']
      systemKey?: BoardColumn['systemKey']
      color?: string
    }>
  ): BoardColumnInput[] =>
    columns.map((column, index) => ({
      id: column.id,
      name: column.name,
      systemKey: column.systemKey || '',
      orderIndex: index,
      color: column.color || '',
    }))

  const loadBoard = async () => {
    try {
      setLoading(true)
      setError(null)

      const [boardData, tagsData] = await Promise.all([
        fetchBoardData(projectId),
        fetchGlobalTags(),
      ])

      const { board: boardValue, columns } = boardData
      setBoard({ ...boardValue, columns })
      setGlobalTags(tagsData)

      const tasksValue = await fetchTasksByBoard(boardValue.id)
      setTasks(tasksValue)
    } catch (loadError) {
      console.error('Failed to load board:', loadError)
      setError(loadError instanceof Error ? loadError.message : 'An unknown error occurred')
    } finally {
      setLoading(false)
    }
  }

  const handleDragStart = (event: DragStartEvent) => {
    if (event.active.data.current?.type === 'task') {
      setActiveTask(tasks.find((entry) => entry.id === event.active.id) || null)
    } else {
      setActiveColumn(event.active.id as string)
    }
  }

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event
    setActiveTask(null)
    setActiveColumn(null)
    if (!over || !board) {
      return
    }

    const activeId = active.id as string
    const overId = over.id as string
    const columns = board.columns || []
    const isColumn = columns.some((column) => column.id === activeId)

    if (isColumn) {
      const oldIndex = columns.findIndex((column) => column.id === activeId)
      const newIndex = columns.findIndex((column) => column.id === overId)
      if (oldIndex !== newIndex) {
        const movedColumns = arrayMove(columns, oldIndex, newIndex).map((column, index) => ({
          ...column,
          orderIndex: index,
        }))
        setBoard({ ...board, columns: movedColumns })
        const response = await saveBoardColumns(board.id, normalizeColumns(movedColumns))
        setBoard({ ...board, columns: response.columns })
      }
      return
    }

    const sourceTask = tasks.find((task) => task.id === activeId)
    const targetTask = tasks.find((task) => task.id === overId)
    if (!sourceTask) {
      return
    }

    const activeColumnId = sourceTask.columnId
    let overColumnId = targetTask?.columnId || activeColumnId
    const targetColumn = board.columns?.find((column) => column.id === overId)
    if (targetColumn) {
      overColumnId = targetColumn.id
    }

    if (activeColumnId === overColumnId) {
      const filtered = tasks
        .filter((task) => task.columnId === activeColumnId)
        .sort((a, b) => (a.orderInColumn || 0) - (b.orderInColumn || 0))
      const oldIndex = filtered.findIndex((task) => task.id === activeId)
      const newIndex = filtered.findIndex((task) => task.id === overId)
      if (oldIndex !== newIndex && targetTask) {
        const updatedTasks = arrayMove(filtered, oldIndex, newIndex)
        updatedTasks.forEach((task, index) => {
          task.orderInColumn = index
        })

        setTasks((prev) => {
          const others = prev.filter((task) => task.columnId !== activeColumnId)
          return [...others, ...updatedTasks]
        })

        await moveTask(activeId, activeColumnId, newIndex)
      }
      return
    }

    const newIndex = tasks.filter((task) => task.columnId === overColumnId).length

    setTasks((prev) =>
      prev.map((task) => {
        if (task.id === activeId) {
          return { ...task, columnId: overColumnId, orderInColumn: newIndex }
        }
        return task
      })
    )

    await moveTask(activeId, overColumnId, newIndex)
  }

  const handleTaskClick = (task: KanbanTask) => {
    setSelectedTask(task)
    setDrawerOpen(true)
  }

  const handleAddTask = async (columnId: string) => {
    if (!board) {
      return
    }

    try {
      const response = await createTask({
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
      await loadBoard()
    } catch (createError) {
      console.error('Failed to create task:', createError)
    }
  }

  const handleDeleteTask = async (taskId: string) => {
    if (!confirm('Are you sure you want to delete this task?')) {
      return
    }

    try {
      await deleteTask(taskId)
      await loadBoard()
    } catch (deleteError) {
      console.error('Failed to delete task:', deleteError)
    }
  }

  const handleColumnSubmit = async (name: string, color: string) => {
    if (!board) {
      return
    }

    if (editingColumnId) {
      const currentColumns = (board.columns || []).map((column) =>
        column.id === editingColumnId
          ? { ...column, name: name.trim(), color }
          : {
              id: column.id,
              name: column.name,
              systemKey: column.systemKey,
              color: column.color,
              orderIndex: column.orderIndex,
            }
      )
      setBoard({
        ...board,
        columns: board.columns?.map((column) =>
          column.id === editingColumnId ? { ...column, name: name.trim(), color } : column
        ),
      })
      const response = await saveBoardColumns(board.id, normalizeColumns(currentColumns))
      setBoard({ ...board, columns: response.columns })
    } else {
      const currentColumns = (board.columns || []).map(
        ({ id, name: columnName, systemKey, color: columnColor }) => ({
          id,
          name: columnName,
          systemKey,
          color: columnColor,
        })
      )
      const newColumns = [...currentColumns, { name: name.trim(), color }]
      setBoard({
        ...board,
        columns: [
          ...(board.columns || []),
          {
            id: 'temp-' + Date.now(),
            boardId: board.id,
            name: name.trim(),
            systemKey: '',
            color,
            orderIndex: (board.columns || []).length,
          },
        ],
      })
      const response = await saveBoardColumns(board.id, normalizeColumns(newColumns))
      setBoard({ ...board, columns: response.columns })
    }

    setIsColumnModalOpen(false)
    setEditingColumnId(null)
  }

  const handleDeleteColumn = async (columnId: string) => {
    if (!board) {
      return
    }
    if (tasks.filter((task) => task.columnId === columnId).length > 0) {
      alert('Cannot delete column with tasks.')
      return
    }
    if (!confirm('Are you sure you want to delete this column?')) {
      return
    }

    const newColumns = (board.columns || [])
      .filter((column) => column.id !== columnId)
      .map(({ id, name, systemKey, color }) => ({ id, name, systemKey, color }))
    try {
      const response = await saveBoardColumns(board.id, normalizeColumns(newColumns))
      setBoard({ ...board, columns: response.columns })
    } catch (deleteError) {
      console.error('Failed to delete column:', deleteError)
    }
  }

  const handleTaskUpdate = async (taskId: string, patch: Partial<KanbanTask>) => {
    await updateTask(taskId, patch)
    setTasks((prev) =>
      prev.map((task) =>
        task.id === taskId ? { ...task, ...patch, updatedAt: new Date().toISOString() } : task
      )
    )
    setSelectedTask((prev) =>
      prev?.id === taskId ? { ...prev, ...patch, updatedAt: new Date().toISOString() } : prev
    )
  }

  const closeTaskDrawer = () => {
    setDrawerOpen(false)
    setSelectedTask(null)
  }

  const closeColumnModal = () => {
    setIsColumnModalOpen(false)
    setEditingColumnId(null)
  }

  const openEditColumnModal = (columnId: string) => {
    setEditingColumnId(columnId)
    setIsColumnModalOpen(true)
  }

  const openCreateColumnModal = () => {
    setEditingColumnId(null)
    setIsColumnModalOpen(true)
  }

  return {
    board,
    tasks,
    globalTags,
    loading,
    error,
    activeTask,
    activeColumn,
    selectedTask,
    drawerOpen,
    isColumnModalOpen,
    editingColumnId,
    sensors,
    columns: board?.columns || [],
    handleDragStart,
    handleDragEnd,
    handleTaskClick,
    handleAddTask,
    handleDeleteTask,
    handleColumnSubmit,
    handleDeleteColumn,
    handleTaskUpdate,
    closeTaskDrawer,
    closeColumnModal,
    openEditColumnModal,
    openCreateColumnModal,
  }
}
