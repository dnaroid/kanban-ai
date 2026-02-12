import { ErrorCode, fail, ok, type Result } from "../../shared/src/ipc'
import type { RunStartInput, TaskUpdateInput } from "@shared/types/ipc"
import type { RunRepoPort, TaskRepoPort } from '../../../ports'

interface ContextSnapshot {
  id: string
}

type TransactionRunner = <T>(fn: () => Result<T>) => Result<T>

export class StartRunUseCase {
  constructor(
    private readonly runRepo: RunRepoPort,
    private readonly taskRepo: TaskRepoPort,
    private readonly buildSnapshot: (input: {
      taskId: string
      roleId: string
      mode?: RunStartInput['mode']
    }) => Result<ContextSnapshot>,
    private readonly withTransaction: TransactionRunner,
    private readonly enqueueRun: (runId: string) => void,
    private readonly resolveInProgressColumnId: (taskId: string) => string | null,
    private readonly updateTaskAndEmit: (
      taskId: string,
      patch: TaskUpdateInput['patch']
    ) => Result<void>
  ) {}

  execute(input: RunStartInput): Result<{ runId: string }> {
    const txResult = this.withTransaction(() => {
      const taskResult = this.taskRepo.getById(input.taskId)
      if (taskResult.ok === false) {
        return taskResult
      }

      const task = taskResult.data
      if (!task) {
        return fail(ErrorCode.TASK_NOT_FOUND, 'Task not found')
      }

      const snapshotResult = this.buildSnapshot({
        taskId: input.taskId,
        roleId: input.roleId,
        mode: input.mode,
      })

      if (snapshotResult.ok === false) {
        return snapshotResult
      }

      const runResult = this.runRepo.create({
        taskId: input.taskId,
        roleId: input.roleId,
        mode: input.mode,
        contextSnapshotId: snapshotResult.data.id,
      })

      if (runResult.ok === false) {
        return runResult
      }

      const inProgressColumnId = this.resolveInProgressColumnId(input.taskId)
      if (inProgressColumnId && task.columnId !== inProgressColumnId) {
        const moveResult = this.taskRepo.move(
          input.taskId,
          inProgressColumnId,
          Number.MAX_SAFE_INTEGER
        )
        if (moveResult.ok === false) {
          return moveResult
        }
      }

      const updateResult = this.updateTaskAndEmit(input.taskId, { status: 'running' })
      if (updateResult.ok === false) {
        return updateResult
      }

      return ok({ runId: runResult.data.id })
    })

    if (txResult.ok === false) {
      return txResult
    }

    this.enqueueRun(txResult.data.runId)
    return txResult
  }
}
