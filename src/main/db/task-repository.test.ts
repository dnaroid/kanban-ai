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

  const { dbManager } = await import('./index.js')
  const { boardRepo } = await import('./board-repository.js')
  const { taskRepo } = await import('./task-repository.js')

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
    db,
    projectId,
    cleanup: () => {
      dbManager.disconnect()
      fs.rmSync(mockUserDataPath, { recursive: true, force: true })
    },
  }
}

describe('TaskRepository.move', () => {
  it('reorders tasks within the same column', async () => {
    const { boardRepo, taskRepo, projectId, cleanup } = await setupDb()

    try {
      const board = boardRepo.getOrCreateDefaultBoard(projectId)
      const columnId = board.columns?.[0].id
      if (!columnId) throw new Error('Missing default column')

      const first = taskRepo.create({
        projectId,
        boardId: board.id,
        columnId,
        title: 'First',
        priority: 'medium',
        type: 'task',
        tags: [],
      })
      const second = taskRepo.create({
        projectId,
        boardId: board.id,
        columnId,
        title: 'Second',
        priority: 'medium',
        type: 'task',
        tags: [],
      })
      const third = taskRepo.create({
        projectId,
        boardId: board.id,
        columnId,
        title: 'Third',
        priority: 'medium',
        type: 'task',
        tags: [],
      })

      taskRepo.move(third.id, columnId, 0)

      const ordered = taskRepo.listByBoard(board.id).filter((task) => task.columnId === columnId)

      expect(ordered.map((task) => task.id)).toEqual([third.id, first.id, second.id])
      expect(ordered.map((task) => task.orderInColumn)).toEqual([0, 1, 2])
    } finally {
      cleanup()
    }
  })

  it('moves tasks between columns and recalculates order', async () => {
    const { boardRepo, taskRepo, projectId, cleanup } = await setupDb()

    try {
      const board = boardRepo.getOrCreateDefaultBoard(projectId)
      const [sourceColumn, destinationColumn] = board.columns ?? []
      if (!sourceColumn || !destinationColumn) throw new Error('Missing default columns')

      const sourceFirst = taskRepo.create({
        projectId,
        boardId: board.id,
        columnId: sourceColumn.id,
        title: 'Source A',
        priority: 'medium',
        type: 'task',
        tags: [],
      })
      const sourceSecond = taskRepo.create({
        projectId,
        boardId: board.id,
        columnId: sourceColumn.id,
        title: 'Source B',
        priority: 'medium',
        type: 'task',
        tags: [],
      })
      const destinationFirst = taskRepo.create({
        projectId,
        boardId: board.id,
        columnId: destinationColumn.id,
        title: 'Destination A',
        priority: 'medium',
        type: 'task',
        tags: [],
      })

      taskRepo.move(sourceSecond.id, destinationColumn.id, 0)

      const ordered = taskRepo.listByBoard(board.id)
      const sourceTasks = ordered.filter((task) => task.columnId === sourceColumn.id)
      const destinationTasks = ordered.filter((task) => task.columnId === destinationColumn.id)

      expect(sourceTasks.map((task) => task.id)).toEqual([sourceFirst.id])
      expect(sourceTasks.map((task) => task.orderInColumn)).toEqual([0])
      expect(destinationTasks.map((task) => task.id)).toEqual([
        sourceSecond.id,
        destinationFirst.id,
      ])
      expect(destinationTasks.map((task) => task.orderInColumn)).toEqual([0, 1])
    } finally {
      cleanup()
    }
  })
})
