import type { KanbanTask } from '@/shared/types/ipc.ts'
import { TaskDetailsTopBar } from './sections/TaskDetailsTopBar'
import { TaskDetailsTags } from './sections/TaskDetailsTags'
import { TaskDetailsModel } from './sections/TaskDetailsModel'
import { TaskDetailsDescription } from './sections/TaskDetailsDescription'
import { TaskDetailsDependencies } from './sections/TaskDetailsDependencies'

interface TaskDrawerDetailsProps {
  task: KanbanTask
  onUpdate?: (id: string, patch: Partial<KanbanTask>) => void
  columnName?: string
  onStartRun?: () => void
  isActive?: boolean
}

export function TaskDrawerDetails({
  task,
  onUpdate,
  onStartRun,
  isActive = false,
}: TaskDrawerDetailsProps) {
  return (
    <div className="flex flex-col h-full bg-[#0B0E14] animate-in fade-in duration-300">
      <div className="flex-none p-6 flex flex-wrap items-end gap-6">
        <TaskDetailsTopBar task={task} onUpdate={onUpdate} />
        <div className="pb-0.5">
          <TaskDetailsTags task={task} onUpdate={onUpdate} />
        </div>
      </div>

      <TaskDetailsDescription
        task={task}
        onUpdate={onUpdate}
        onStartRun={onStartRun}
        isActive={isActive}
        headerLeft={<TaskDetailsModel task={task} onUpdate={onUpdate} />}
      />

      <TaskDetailsDependencies task={task} />
    </div>
  )
}
