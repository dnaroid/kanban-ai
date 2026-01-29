import { randomUUID } from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, it, expect, vi } from 'vitest'

let mockUserDataPath = ''

vi.mock('electron', () => ({
  app: {
    getPath: () => mockUserDataPath,
  },
}))

const createTempDir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'kanban-ai-test-'))

const setupDb = async () => {
  mockUserDataPath = createTempDir()
  vi.resetModules()

  const { dbManager } = await import('../db/index.js')
  const { boardRepo } = await import('../db/board-repository.js')
  const { taskRepo } = await import('../db/task-repository.js')
  const { dependencyService } = await import('./dependency-service.js')

  const db = dbManager.connect()
  const projectId = randomUUID()
  const now = new Date().toISOString()

  db.prepare(
    `
      INSERT INTO projects (id, name, path, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?)
    `
  ).run(projectId, 'Test Project', `/tmp/${projectId}`, now, now)

  return {
    dbManager,
    boardRepo,
    taskRepo,
    dependencyService,
    projectId,
    cleanup: () => {
      dbManager.disconnect()
      fs.rmSync(mockUserDataPath, { recursive: true, force: true })
    },
  }
}

describe('dependencyService', () => {
  it('prevents cycles in blocking links', async () => {
    const { boardRepo, taskRepo, dependencyService, projectId, cleanup } = await setupDb()

    try {
      const board = boardRepo.getOrCreateDefaultBoard(projectId)
      const columnId = board.columns?.[0].id
      if (!columnId) throw new Error('Missing column')

      const taskA = taskRepo.create({
        projectId,
        boardId: board.id,
        columnId,
        title: 'Task A',
        priority: 'medium',
        type: 'task',
        tags: [],
      })
      const taskB = taskRepo.create({
        projectId,
        boardId: board.id,
        columnId,
        title: 'Task B',
        priority: 'medium',
        type: 'task',
        tags: [],
      })

      dependencyService.add({ fromTaskId: taskA.id, toTaskId: taskB.id, type: 'blocks' })

      expect(() => {
        dependencyService.add({ fromTaskId: taskB.id, toTaskId: taskA.id, type: 'blocks' })
      }).toThrow('Dependency cycle detected')
    } finally {
      cleanup()
    }
  })
})
