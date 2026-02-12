import type { CreateTaskInput, KanbanTask, TaskPatch } from '../../../shared/dist/types/ipc'
import type { Result } from '../../../shared/dist/ipc'

export interface TaskRepoPort {
  create(input: CreateTaskInput): Result<KanbanTask>
  listByBoard(boardId: string): Result<KanbanTask[]>
  getById(taskId: string): Result<KanbanTask | null>
  update(taskId: string, patch: TaskPatch): Result<void>
  move(taskId: string, toColumnId: string, toIndex: number): Result<void>
  delete(taskId: string): Result<boolean>
}
