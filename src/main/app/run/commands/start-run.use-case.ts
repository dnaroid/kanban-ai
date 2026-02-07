import { ok, type Result } from '../../../../shared/ipc'
import type { RunStartInput, TaskUpdateInput } from '../../../../shared/types/ipc'
import type { RunRepoPort, TaskRepoPort } from '../../../ports'

interface ContextSnapshot {
  id: string
}

export class StartRunUseCase {
  constructor(
    private readonly runRepo: RunRepoPort,
    private readonly taskRepo: TaskRepoPort,
    private readonly buildSnapshot: (input: {
      taskId: string
      roleId: string
      mode?: RunStartInput['mode']
    }) => ContextSnapshot,
    private readonly enqueueRun: (runId: string) => void,
    private readonly resolveInProgressColumnId: (taskId: string) => string | null,
    private readonly updateTaskAndEmit: (taskId: string, patch: TaskUpdateInput['patch']) => void
  ) {}

  execute(input: RunStartInput): Result<{ runId: string }> {
    const snapshot = this.buildSnapshot({
      taskId: input.taskId,
      roleId: input.roleId,
      mode: input.mode,
    })

    const runResult = this.runRepo.create({
      taskId: input.taskId,
      roleId: input.roleId,
      mode: input.mode,
      contextSnapshotId: snapshot.id,
    })

    if (runResult.ok === false) {
      return runResult
    }

    this.enqueueRun(runResult.data.id)

    const taskResult = this.taskRepo.getById(input.taskId)
    if (taskResult.ok === false) {
      return taskResult
    }

    const task = taskResult.data
    const inProgressColumnId = this.resolveInProgressColumnId(input.taskId)
    if (task && inProgressColumnId && task.columnId !== inProgressColumnId) {
      const moveResult = this.taskRepo.move(
        input.taskId,
        inProgressColumnId,
        Number.MAX_SAFE_INTEGER
      )
      if (moveResult.ok === false) {
        return moveResult
      }
    }

    this.updateTaskAndEmit(input.taskId, { status: 'running' })

    return ok({ runId: runResult.data.id })
  }
}
