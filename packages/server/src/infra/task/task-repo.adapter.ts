import type { CreateTaskInput, KanbanTask, TaskPatch } from "@shared/types/ipc"
import * as ipcResult from '@shared/ipc/result'
import type { Result } from '@shared/ipc/result'
const { ok } = ipcResult
import type { TaskRepoPort } from '../../ports'
import { taskRepo } from '../../db/task-repository'
import { toResultError } from '../../ipc/map-error'

export class TaskRepoAdapter implements TaskRepoPort {
  create(input: CreateTaskInput): Result<KanbanTask> {
    try {
      return ok(taskRepo.create(input))
    } catch (error) {
      return toResultError(error)
    }
  }

  listByBoard(boardId: string): Result<KanbanTask[]> {
    try {
      return ok(taskRepo.listByBoard(boardId))
    } catch (error) {
      return toResultError(error)
    }
  }

  getById(taskId: string): Result<KanbanTask | null> {
    try {
      return ok(taskRepo.getById(taskId))
    } catch (error) {
      return toResultError(error)
    }
  }

  update(taskId: string, patch: TaskPatch): Result<void> {
    try {
      taskRepo.update(taskId, patch)
      return ok(undefined)
    } catch (error) {
      return toResultError(error)
    }
  }

  move(taskId: string, toColumnId: string, toIndex: number): Result<void> {
    try {
      taskRepo.move(taskId, toColumnId, toIndex)
      return ok(undefined)
    } catch (error) {
      return toResultError(error)
    }
  }

  delete(taskId: string): Result<boolean> {
    try {
      return ok(taskRepo.delete(taskId))
    } catch (error) {
      return toResultError(error)
    }
  }
}
