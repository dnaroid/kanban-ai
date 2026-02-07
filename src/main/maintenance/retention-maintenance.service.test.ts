import { describe, expect, it } from 'vitest'
import { randomUUID } from 'node:crypto'
import { createTestDb } from '../../tests/helpers/test-db'
import { boardRepo } from '../db/board-repository'
import { contextSnapshotRepo } from '../db/context-snapshot-repository'
import { dbManager } from '../db'
import { projectRepo } from '../db/project-repository'
import { runEventRepo } from '../db/run-event-repository'
import { runRepo } from '../db/run-repository'
import { taskRepo } from '../db/task-repository'
import { retentionMaintenanceService } from './retention-maintenance.service'

describe('retentionMaintenanceService', () => {
  it('cleans only records older than cutoff', () => {
    const testDb = createTestDb()
    try {
      const project = projectRepo.create({
        name: 'Retention Project',
        path: `/tmp/retention-${randomUUID()}`,
      })
      const board = boardRepo.getOrCreateDefaultBoard(project.id)
      const columnId = board.columns?.[0]?.id
      if (!columnId) throw new Error('Missing board column')

      const task = taskRepo.create({
        projectId: project.id,
        boardId: board.id,
        columnId,
        title: 'Retention task',
        type: 'task',
        priority: 'normal',
        difficulty: 'medium',
        tags: [],
      })
      const snapshot = contextSnapshotRepo.create({
        taskId: task.id,
        kind: 'run_input_v1',
        payload: {},
        hash: `hash-${randomUUID()}`,
      })
      const run = runRepo.create({
        taskId: task.id,
        roleId: 'dev',
        contextSnapshotId: snapshot.id,
      })

      const oldEvent = runEventRepo.create({
        runId: run.id,
        eventType: 'status',
        payload: { status: 'running' },
      })
      const newEvent = runEventRepo.create({
        runId: run.id,
        eventType: 'status',
        payload: { status: 'succeeded' },
      })

      const db = dbManager.connect()
      db.prepare('UPDATE run_events SET ts = ? WHERE id = ?').run(
        new Date(Date.now() - 40 * 24 * 60 * 60 * 1000).toISOString(),
        oldEvent.id
      )
      db.prepare('UPDATE run_events SET ts = ? WHERE id = ?').run(
        new Date().toISOString(),
        newEvent.id
      )

      const oldArtifactId = randomUUID()
      const newArtifactId = randomUUID()
      db.prepare(
        `
          INSERT INTO artifacts (id, run_id, kind, title, content, metadata_json, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `
      ).run(
        oldArtifactId,
        run.id,
        'diff',
        'Old artifact',
        'old artifact content',
        '{}',
        new Date(Date.now() - 45 * 24 * 60 * 60 * 1000).toISOString()
      )
      db.prepare(
        `
          INSERT INTO artifacts (id, run_id, kind, title, content, metadata_json, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `
      ).run(
        newArtifactId,
        run.id,
        'diff',
        'New artifact',
        'new artifact content',
        '{}',
        new Date().toISOString()
      )

      const dryRun = retentionMaintenanceService.runCleanup({ days: 30, dryRun: true })
      expect(dryRun.deletedRunEvents).toBeGreaterThanOrEqual(1)
      expect(dryRun.deletedArtifacts).toBeGreaterThanOrEqual(1)

      const cleaned = retentionMaintenanceService.runCleanup({ days: 30, maxDeletes: 100 })
      expect(cleaned.deletedRunEvents).toBeGreaterThanOrEqual(1)
      expect(cleaned.deletedArtifacts).toBeGreaterThanOrEqual(1)

      const remainingEventIds = runEventRepo.listByRun(run.id).map((event) => event.id)
      expect(remainingEventIds).toContain(newEvent.id)
      expect(remainingEventIds).not.toContain(oldEvent.id)

      const artifactRows = db
        .prepare('SELECT id FROM artifacts WHERE run_id = ? ORDER BY created_at ASC')
        .all(run.id) as Array<{ id: string }>
      const remainingArtifactIds = artifactRows.map((row) => row.id)
      expect(remainingArtifactIds).toContain(newArtifactId)
      expect(remainingArtifactIds).not.toContain(oldArtifactId)
    } finally {
      testDb.cleanup()
    }
  })
})
