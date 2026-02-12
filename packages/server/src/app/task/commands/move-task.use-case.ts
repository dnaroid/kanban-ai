import { ok, type Result } from '@shared/ipc'
import type { TaskMoveInput } from '@shared/types/ipc'
import { TaskMovePolicy } from '../../../domain/task/task-move.policy'
import type { TaskRepoPort } from '../../../ports'

export class MoveTaskUseCase {
  constructor(
    private readonly taskRepo: TaskRepoPort,
    private readonly policy: TaskMovePolicy
  ) {}

  execute(input: TaskMoveInput): Result<{ ok: true }> {
    const policyResult = this.policy.validate(input.taskId, input.toColumnId, input.toIndex)
    if (policyResult.ok === false) {
      return policyResult
    }

    const moveResult = this.taskRepo.move(input.taskId, input.toColumnId, input.toIndex)
    if (moveResult.ok === false) {
      return moveResult
    }

    return ok({ ok: true })
  }
}
