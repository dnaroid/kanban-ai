import { useSortable, SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { AlertCircle, Edit2, GripVertical, Plus, Trash2 } from 'lucide-react'
import type { KanbanTask, Tag } from '@shared/types/ipc'
import { cn } from '@web/lib/utils'
import { SortableTask } from '@web/components/kanban/board/SortableTask'

export interface SortableColumnProps {
  id: string
  name: string
  color: string
  tasks: KanbanTask[]
  globalTags: Tag[]
  onAddTask: () => void
  onDeleteTask: (id: string) => void
  onTaskClick?: (task: KanbanTask) => void
  onEdit: () => void
  onDelete: () => void
}

export function SortableColumn({
  id,
  name,
  color,
  tasks,
  globalTags,
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
        'flex-shrink-0 w-80 rounded-2xl border flex flex-col h-full transition-all duration-300',
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
              title="Add Task"
            >
              <Plus className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar p-3">
        <SortableContext items={tasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
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
                globalTags={globalTags}
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
