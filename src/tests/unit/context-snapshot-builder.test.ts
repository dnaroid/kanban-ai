import { describe, expect, it } from 'vitest'
import { ErrorCode, ok } from '../../shared/ipc'
import { ContextSnapshotBuilder } from '../../main/run/context-snapshot-builder'

describe('ContextSnapshotBuilder', () => {
  it('returns Result.fail and does not create snapshot when task is missing', () => {
    const createSpy = { calls: 0 }
    const builder = new ContextSnapshotBuilder({
      taskRepo: {
        create: () => {
          throw new Error('not used')
        },
        listByBoard: () => {
          throw new Error('not used')
        },
        getById: () => ok(null),
        update: () => {
          throw new Error('not used')
        },
        move: () => {
          throw new Error('not used')
        },
        delete: () => {
          throw new Error('not used')
        },
      },
      projectRepo: {
        create: () => {
          throw new Error('not used')
        },
        getAll: () => {
          throw new Error('not used')
        },
        getById: () => {
          throw new Error('not used')
        },
        update: () => {
          throw new Error('not used')
        },
        delete: () => {
          throw new Error('not used')
        },
      },
      boardRepo: {
        getDefault: () => {
          throw new Error('not used')
        },
        getOrCreateDefaultBoard: () => {
          throw new Error('not used')
        },
        getColumns: () => {
          throw new Error('not used')
        },
        updateColumns: () => {
          throw new Error('not used')
        },
      },
      contextSnapshotRepo: {
        create: () => {
          createSpy.calls += 1
          return ok({ id: 'snapshot-id' })
        },
      },
      rolePresetProvider: {
        getById: (roleId: string) => ({
          id: roleId,
          name: roleId,
          description: '',
          preset: {},
        }),
      },
    })

    const result = builder.build({
      taskId: '00000000-0000-0000-0000-000000000001',
      roleId: 'dev',
      mode: 'execute',
    })

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.code).toBe(ErrorCode.TASK_NOT_FOUND)
    }
    expect(createSpy.calls).toBe(0)
  })
})
