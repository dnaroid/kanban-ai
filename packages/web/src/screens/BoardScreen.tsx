import { closestCorners, DndContext, DragOverlay } from '@dnd-kit/core'
import { horizontalListSortingStrategy, SortableContext } from '@dnd-kit/sortable'
import { AlertCircle, Clock, Plus } from 'lucide-react'
import { TaskDrawer } from '@web/components/kanban/TaskDrawer'
import { SortableColumn } from '@web/components/kanban/board/SortableColumn'
import { SortableTask } from '@web/components/kanban/board/SortableTask'
import { ColumnModal } from '@web/components/kanban/board/ColumnModal'
import { useBoardModel } from '@web/features/board/model/use-board-model'

interface BoardScreenProps {
  projectId: string
  projectName: string
}

export function BoardScreen({ projectId }: BoardScreenProps) {
  const {
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
    columns,
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
  } = useBoardModel({ projectId })

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
                  onEdit={() => openEditColumnModal(column.id)}
                  onDelete={() => handleDeleteColumn(column.id)}
                  onDeleteTask={handleDeleteTask}
                />
              ))}
              <div className="flex-shrink-0 w-80 h-full flex flex-col">
                <button
                  onClick={openCreateColumnModal}
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
        onClose={closeColumnModal}
        onSubmit={handleColumnSubmit}
        initialData={editingColumnId ? columns.find((c) => c.id === editingColumnId) : undefined}
        title={editingColumnId ? 'Edit Column' : 'Add New Column'}
      />
      <TaskDrawer
        task={selectedTask}
        isOpen={drawerOpen}
        onClose={closeTaskDrawer}
        columnName={board?.columns?.find((c) => c.id === selectedTask?.columnId)?.name}
        onUpdate={handleTaskUpdate}
      />
    </div>
  )
}
