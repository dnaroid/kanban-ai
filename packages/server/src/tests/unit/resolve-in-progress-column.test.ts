import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { randomUUID } from 'node:crypto'
import { boardRepo } from '../../main/db/board-repository'
import { dbManager } from '../../main/db'
import { createAppContext } from '../../main/ipc/composition/create-app-context'
import { createTestDb } from '../helpers/test-db'

describe('resolveInProgressColumnId', () => {
  let testDb: ReturnType<typeof createTestDb>

  beforeAll(() => {
    testDb = createTestDb()
  })

  afterAll(() => {
    testDb.cleanup()
  })

  it('prefers system_key=in_progress over orderIndex fallback', () => {
    const context = createAppContext()

    const projectResult = context.createProjectUseCase.execute({
      name: 'Resolve Key Project',
      path: `/tmp/resolve-key-${randomUUID()}`,
    })
    expect(projectResult.ok).toBe(true)
    if (!projectResult.ok) {
      return
    }

    const board = boardRepo.getDefault(projectResult.data.id)
    const backlog = board.columns?.find((column) => column.orderIndex === 0)
    const done = board.columns?.find((column) => column.orderIndex === 2)
    expect(backlog).toBeDefined()
    expect(done).toBeDefined()
    if (!backlog || !done) {
      return
    }

    const db = dbManager.connect()
    db.prepare('UPDATE board_columns SET system_key = ? WHERE board_id = ?').run('', board.id)
    db.prepare('UPDATE board_columns SET system_key = ? WHERE id = ?').run('in_progress', done.id)

    const taskResult = context.createTaskUseCase.execute({
      projectId: projectResult.data.id,
      boardId: board.id,
      columnId: backlog.id,
      title: 'Task for resolve test',
      type: 'feature',
      priority: 'normal',
      difficulty: 'medium',
      tags: [],
    })

    expect(taskResult.ok).toBe(true)
    if (!taskResult.ok) {
      return
    }

    const resolved = context.resolveInProgressColumnId(taskResult.data.task.id)
    expect(resolved).toBe(done.id)
  })
})
