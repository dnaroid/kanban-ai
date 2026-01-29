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
  const { backupService } = await import('./backup-service.js')

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
    backupService,
    db,
    projectId,
    cleanup: () => {
      dbManager.disconnect()
      fs.rmSync(mockUserDataPath, { recursive: true, force: true })
    },
  }
}

describe('backupService', () => {
  it('exports and imports a project as new', async () => {
    const { boardRepo, taskRepo, backupService, db, projectId, cleanup } = await setupDb()

    try {
      const board = boardRepo.getOrCreateDefaultBoard(projectId)
      const columnId = board.columns?.[0].id
      if (!columnId) throw new Error('Missing column')

      const task = taskRepo.create({
        projectId,
        boardId: board.id,
        columnId,
        title: 'Backup Task',
        priority: 'medium',
        type: 'task',
        tags: [],
      })

      const snapshotId = randomUUID()
      db.prepare(
        `
          INSERT INTO context_snapshots (id, task_id, kind, summary, payload_json, hash, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `
      ).run(snapshotId, task.id, 'task', 'summary', '{}', 'hash', new Date().toISOString())

      const runId = randomUUID()
      db.prepare(
        `
          INSERT INTO runs (
            id, task_id, role_id, mode, status, started_at, finished_at, error_text,
            budget_json, context_snapshot_id, ai_tokens_in, ai_tokens_out, ai_cost_usd,
            created_at, updated_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `
      ).run(
        runId,
        task.id,
        'dev',
        'auto',
        'success',
        new Date().toISOString(),
        new Date().toISOString(),
        '',
        '{}',
        snapshotId,
        0,
        0,
        0,
        new Date().toISOString(),
        new Date().toISOString()
      )

      db.prepare(
        `
          INSERT INTO artifacts (id, run_id, kind, title, content, metadata_json, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `
      ).run(randomUUID(), runId, 'log', 'Artifact', 'payload', '{}', new Date().toISOString())

      const exportPath = path.join(mockUserDataPath, 'export.zip')
      backupService.exportProject({ projectId, toPath: exportPath })

      const result = backupService.importProject({
        zipPath: exportPath,
        mode: 'new',
        projectPath: `/tmp/${randomUUID()}`,
      })

      expect(result.projectId).toBeDefined()
      const count = db
        .prepare('SELECT COUNT(*) as count FROM tasks WHERE project_id = ?')
        .get(result.projectId) as { count: number }
      expect(count.count).toBe(1)
    } finally {
      cleanup()
    }
  })
})
