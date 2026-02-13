import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { createTestDb } from '../tests/helpers/test-db'
import { contextSnapshotRepo } from '../db/context-snapshot-repository'
import { boardRepo } from '../db/board-repository'
import { projectRepo } from '../db/project-repository'
import { runEventRepo } from '../db/run-event-repository'
import { runRepo } from '../db/run-repository'
import { taskRepo } from '../db/task-repository'
import { RunStateMachine } from './run-state-machine'

describe('RunStateMachine', () => {
  it('applies status transitions and writes status events', () => {
    const testDb = createTestDb()
    try {
      const project = projectRepo.create({
        name: 'State Machine Project',
        path: `/tmp/state-machine-project-${randomUUID()}`,
      })
      const board = boardRepo.getOrCreateDefaultBoard(project.id)
      const firstColumnId = board.columns?.[0]?.id
      expect(firstColumnId).toBeDefined()
      if (!firstColumnId) {
        throw new Error('Expected default board column to exist')
      }
      const task = taskRepo.create({
        projectId: project.id,
        boardId: board.id,
        columnId: firstColumnId,
        title: 'State transition task',
        type: 'task',
        priority: 'normal',
        difficulty: 'medium',
        tags: [],
      })
      const snapshot = contextSnapshotRepo.create({
        taskId: task.id,
        kind: 'run_input_v1',
        payload: {},
        hash: 'state-machine-hash',
      })

      const run = runRepo.create({
        taskId: task.id,
        roleId: 'dev',
        contextSnapshotId: snapshot.id,
      })

      const stateMachine = new RunStateMachine()
      stateMachine.markRunning(run.id)
      stateMachine.markFailed(run.id, 'boom')
      stateMachine.markCanceled(run.id)

      const afterRun = runRepo.getById(run.id)
      expect(afterRun?.status).toBe('canceled')
      expect(afterRun?.errorText).toBe('boom')

      const events = runEventRepo.listByRun(run.id)
      const statuses = events
        .filter((event) => event.eventType === 'status')
        .map((event) => (event.payload as { status?: string }).status)
      expect(statuses).toEqual(['running', 'failed', 'canceled'])
    } finally {
      testDb.cleanup()
    }
  })
})
