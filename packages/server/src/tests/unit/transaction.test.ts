import { describe, it, expect, afterAll, beforeAll } from 'vitest'
import { ErrorCode, fail, ok } from '../../shared/ipc'
import { dbManager } from '../../main/db'
import { withTransaction } from '../../main/db/transaction'
import { createTestDb } from '../helpers/test-db'

describe('withTransaction', () => {
  let testDb: ReturnType<typeof createTestDb>

  beforeAll(() => {
    testDb = createTestDb()
  })

  afterAll(() => {
    testDb.cleanup()
  })

  it('commits transaction on Result.ok', () => {
    const db = dbManager.connect()
    const now = new Date().toISOString()
    const projectId = `test-project-tx-1-${Date.now()}`

    const result = withTransaction(() => {
      db.prepare(
        `INSERT INTO projects (id, name, path, color, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`
      ).run(projectId, 'Test Project', `/tmp/test-${projectId}`, '#ff0000', now, now)

      return ok({ projectId })
    })

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data.projectId).toBe(projectId)
    }

    const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId)
    expect(project).toBeDefined()
  })

  it('rolls back transaction on Result.fail', () => {
    const db = dbManager.connect()
    const now = new Date().toISOString()
    const projectId = `test-project-tx-2-${Date.now()}`

    const result = withTransaction(() => {
      db.prepare(
        `INSERT INTO projects (id, name, path, color, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`
      ).run(projectId, 'Test Project', `/tmp/test-${projectId}`, '#ff0000', now, now)

      return fail(ErrorCode.VALIDATION_ERROR, 'Simulated validation error')
    })

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.code).toBe(ErrorCode.VALIDATION_ERROR)
      expect(result.error.message).toBe('Simulated validation error')
    }

    const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId)
    expect(project).toBeUndefined()
  })

  it('rolls back multiple operations on failure', () => {
    const db = dbManager.connect()
    const now = new Date().toISOString()
    const projectId = `test-project-tx-3-${Date.now()}`
    const taskId = `test-task-tx-3-${Date.now()}`

    const result = withTransaction(() => {
      db.prepare(
        `INSERT INTO projects (id, name, path, color, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`
      ).run(projectId, 'Test Project', `/tmp/test-${projectId}`, '#ff0000', now, now)

      db.prepare(
        `INSERT INTO tasks (id, project_id, title, description, status, priority, difficulty, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        taskId,
        projectId,
        'Test Task',
        'Test Description',
        'queued',
        'normal',
        'medium',
        now,
        now
      )

      return fail(ErrorCode.INTERNAL_ERROR, 'Task validation failed')
    })

    expect(result.ok).toBe(false)

    const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId)
    expect(project).toBeUndefined()

    const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId)
    expect(task).toBeUndefined()
  })

  it('handles exceptions thrown inside transaction', () => {
    const db = dbManager.connect()
    const now = new Date().toISOString()
    const projectId = `test-project-tx-4-${Date.now()}`

    const result = withTransaction(() => {
      db.prepare(
        `INSERT INTO projects (id, name, path, color, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`
      ).run(projectId, 'Test Project', `/tmp/test-${projectId}`, '#ff0000', now, now)

      throw new Error('Unexpected error')
    })

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.code).toBe(ErrorCode.INTERNAL_ERROR)
      expect(result.error.message).toContain('Unexpected error')
    }

    const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId)
    expect(project).toBeUndefined()
  })

  it('commits nested operations when all succeed', () => {
    const db = dbManager.connect()
    const now = new Date().toISOString()
    const projectId = `test-project-tx-5-${Date.now()}`
    const boardId = `test-board-tx-5-${Date.now()}`

    const result = withTransaction(() => {
      db.prepare(
        `INSERT INTO projects (id, name, path, color, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`
      ).run(projectId, 'Test Project', `/tmp/test-${projectId}`, '#ff0000', now, now)

      db.prepare(
        `INSERT INTO boards (id, project_id, name, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?)`
      ).run(boardId, projectId, 'Test Board', now, now)

      return ok({ projectId, boardId })
    })

    expect(result.ok).toBe(true)

    const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId)
    expect(project).toBeDefined()

    const board = db.prepare('SELECT * FROM boards WHERE id = ?').get(boardId)
    expect(board).toBeDefined()
  })
})
