import * as ipcErrors from '@shared/ipc/errors'
const { ErrorCode } = ipcErrors
import * as ipcResult from '@shared/ipc/result'
import type { Result } from '@shared/ipc/result'
const { fail, ok } = ipcResult
export class TaskMovePolicy {
  validate(taskId: string, toColumnId: string, toIndex: number): Result<void> {
    if (!taskId || !toColumnId) {
      return fail(ErrorCode.VALIDATION_ERROR, 'Task and target column are required')
    }

    if (!Number.isInteger(toIndex) || toIndex < 0) {
      return fail(ErrorCode.VALIDATION_ERROR, 'Target index must be a non-negative integer')
    }

    return ok(undefined)
  }
}
