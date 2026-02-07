import { describe, expect, it, vi } from 'vitest'
import { ErrorCode, fail, ok } from '../../shared/ipc'
import type { Run, RunStartInput, TaskUpdateInput, KanbanTask } from '../../shared/types/ipc'
import { StartRunUseCase } from '../../main/app/run/commands/start-run.use-case'
import type { RunRepoPort, TaskRepoPort } from '../../main/ports'

const input: RunStartInput = {
  taskId: '11111111-1111-4111-8111-111111111111',
  roleId: 'dev',
  mode: 'execute',
}

const task: KanbanTask = {
  id: input.taskId,
  projectId: '22222222-2222-4222-8222-222222222222',
  boardId: '33333333-3333-4333-8333-333333333333',
  columnId: '44444444-4444-4444-8444-444444444444',
  title: 'Task',
  status: 'queued',
  priority: 'normal',
  difficulty: 'medium',
  type: 'task',
  tags: [],
}

const run: Run = {
  id: '55555555-5555-4555-8555-555555555555',
  taskId: input.taskId,
  roleId: input.roleId,
  mode: 'execute',
  kind: 'task-run',
  status: 'queued',
  errorText: '',
  budget: {},
  contextSnapshotId: '66666666-6666-4666-8666-666666666666',
  aiTokensIn: 0,
  aiTokensOut: 0,
  aiCostUsd: 0,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
}

describe('StartRunUseCase', () => {
  it('does not enqueue when update fails in transaction', () => {
    const enqueueRun = vi.fn()
    const runRepo: RunRepoPort = {
      create: vi.fn(() => ok(run)),
      getById: vi.fn(() => ok(null)),
      listByTask: vi.fn(() => ok([])),
      listByStatus: vi.fn(() => ok([])),
      update: vi.fn(() => ok(undefined)),
      delete: vi.fn(() => ok(undefined)),
    }
    const taskRepo: TaskRepoPort = {
      create: vi.fn(() => ok(task)),
      listByBoard: vi.fn(() => ok([])),
      getById: vi.fn(() => ok(task)),
      update: vi.fn(() => ok(undefined)),
      move: vi.fn(() => ok(undefined)),
      delete: vi.fn(() => ok(true)),
    }
    const buildSnapshot = vi.fn(() => ok({ id: run.contextSnapshotId }))
    const updateTaskAndEmit = vi.fn((_taskId: string, _patch: TaskUpdateInput['patch']) =>
      fail(ErrorCode.INTERNAL_ERROR, 'update failed')
    )

    const useCase = new StartRunUseCase(
      runRepo,
      taskRepo,
      buildSnapshot,
      (fn) => fn(),
      enqueueRun,
      () => '77777777-7777-4777-8777-777777777777',
      updateTaskAndEmit
    )

    const result = useCase.execute(input)

    expect(result.ok).toBe(false)
    expect(enqueueRun).not.toHaveBeenCalled()
    expect(buildSnapshot).toHaveBeenCalledTimes(1)
    expect(runRepo.create).toHaveBeenCalledTimes(1)
  })

  it('enqueues once only after successful commit', () => {
    const callOrder: string[] = []
    const enqueueRun = vi.fn(() => {
      callOrder.push('enqueue')
    })
    const runRepo: RunRepoPort = {
      create: vi.fn(() => {
        callOrder.push('createRun')
        return ok(run)
      }),
      getById: vi.fn(() => ok(null)),
      listByTask: vi.fn(() => ok([])),
      listByStatus: vi.fn(() => ok([])),
      update: vi.fn(() => ok(undefined)),
      delete: vi.fn(() => ok(undefined)),
    }
    const taskRepo: TaskRepoPort = {
      create: vi.fn(() => ok(task)),
      listByBoard: vi.fn(() => ok([])),
      getById: vi.fn(() => {
        callOrder.push('getTask')
        return ok(task)
      }),
      update: vi.fn(() => ok(undefined)),
      move: vi.fn(() => {
        callOrder.push('moveTask')
        return ok(undefined)
      }),
      delete: vi.fn(() => ok(true)),
    }
    const buildSnapshot = vi.fn(() => {
      callOrder.push('buildSnapshot')
      return ok({ id: run.contextSnapshotId })
    })
    const updateTaskAndEmit = vi.fn(() => {
      callOrder.push('updateTask')
      return ok(undefined)
    })

    const useCase = new StartRunUseCase(
      runRepo,
      taskRepo,
      buildSnapshot,
      (fn) => {
        callOrder.push('tx:start')
        const result = fn()
        callOrder.push(result.ok ? 'tx:commit' : 'tx:rollback')
        return result
      },
      enqueueRun,
      () => '77777777-7777-4777-8777-777777777777',
      updateTaskAndEmit
    )

    const result = useCase.execute(input)

    expect(result.ok).toBe(true)
    expect(enqueueRun).toHaveBeenCalledTimes(1)
    expect(callOrder).toEqual([
      'tx:start',
      'getTask',
      'buildSnapshot',
      'createRun',
      'moveTask',
      'updateTask',
      'tx:commit',
      'enqueue',
    ])
  })
})
