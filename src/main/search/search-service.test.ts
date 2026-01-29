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
  const { searchService } = await import('./search-service.js')

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
    searchService,
    projectId,
    cleanup: () => {
      dbManager.disconnect()
      fs.rmSync(mockUserDataPath, { recursive: true, force: true })
    },
  }
}

describe('searchService.queryTasks', () => {
  it('returns tasks that match title and tags', async () => {
    const { boardRepo, taskRepo, searchService, projectId, cleanup } = await setupDb()

    try {
      const board = boardRepo.getOrCreateDefaultBoard(projectId)
      const columnId = board.columns?.[0].id
      if (!columnId) throw new Error('Missing column')

      taskRepo.create({
        projectId,
        boardId: board.id,
        columnId,
        title: 'Alpha Task',
        priority: 'medium',
        type: 'task',
        tags: ['frontend'],
      })
      taskRepo.create({
        projectId,
        boardId: board.id,
        columnId,
        title: 'Beta Task',
        priority: 'medium',
        type: 'task',
        tags: ['backend'],
      })

      const titleResults = searchService.queryTasks('Alpha', { projectId })
      expect(titleResults).toHaveLength(1)
      expect(titleResults[0].title).toBe('Alpha Task')

      const tagResults = searchService.queryTasks('backend', { projectId })
      expect(tagResults).toHaveLength(1)
      expect(tagResults[0].title).toBe('Beta Task')
    } finally {
      cleanup()
    }
  })
})
