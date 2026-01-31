import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { setTimeout as delay } from 'node:timers/promises'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const testState = vi.hoisted(() => ({
  userDataPath: '',
}))

vi.mock('electron', () => ({
  app: {
    getPath: () => testState.userDataPath,
  },
}))

import { dbManager } from '../db/index.js'
import { projectRepo } from '../db/project-repository.js'
import { boardRepo } from '../db/board-repository.js'
import { taskRepo } from '../db/task-repository.js'
import { contextSnapshotRepo } from '../db/context-snapshot-repository.js'
import { runRepo } from '../db/run-repository.js'
import { runEventRepo } from '../db/run-event-repository.js'
import { artifactRepo } from '../db/artifact-repository.js'
import { JobRunner } from './job-runner.js'
import { MockExecutor } from './mock-executor.js'

const createRun = () => {
  const project = projectRepo.create({
    name: 'Test Project',
    path: path.join(testState.userDataPath, `repo-${randomUUID()}`),
  })
  const board = boardRepo.getDefault(project.id)
  const columnId = board.columns?.[0]?.id ?? boardRepo.getColumns(board.id)[0].id
  const task = taskRepo.create({
    projectId: project.id,
    boardId: board.id,
    columnId,
    title: 'Test Task',
    priority: 'normal',
    difficulty: 'medium',
    type: 'task',
    tags: [],
  })
  const snapshot = contextSnapshotRepo.create({
    taskId: task.id,
    kind: 'run_input_v1',
    payload: { taskId: task.id },
    hash: randomUUID(),
  })

  return runRepo.create({
    taskId: task.id,
    roleId: 'ba',
    contextSnapshotId: snapshot.id,
  })
}

const waitUntil = async (predicate: () => boolean, timeoutMs = 1000) => {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    if (predicate()) return
    await delay(10)
  }
  throw new Error('Timeout waiting for condition')
}

const waitForStatus = async (runId: string, status: string, timeoutMs = 1000) => {
  await waitUntil(() => runRepo.getById(runId)?.status === status, timeoutMs)
}

beforeEach(() => {
  testState.userDataPath = fs.mkdtempSync(path.join(os.tmpdir(), 'kanban-ai-'))
})

afterEach(() => {
  dbManager.disconnect()
  if (testState.userDataPath) {
    fs.rmSync(testState.userDataPath, { recursive: true, force: true })
    testState.userDataPath = ''
  }
})

describe('JobRunner', () => {
  it('processes queued runs and persists events/artifacts', async () => {
    const executor = new MockExecutor({ autoCompleteMs: 5 })
    const runner = new JobRunner(executor, { concurrency: 1 })

    const run = createRun()
    runner.enqueue(run.id)

    await waitForStatus(run.id, 'succeeded')

    const events = runEventRepo.listByRun(run.id)
    const eventTypes = events.map((event) => event.eventType)

    expect(eventTypes).toContain('stdout')
    expect(eventTypes).toContain('message')
    expect(eventTypes).toContain('status')

    const statusPayloads = events
      .filter((event) => event.eventType === 'status')
      .map((event) => event.payload as { status?: string })
    expect(statusPayloads.some((payload) => payload.status === 'running')).toBe(true)
    expect(statusPayloads.some((payload) => payload.status === 'succeeded')).toBe(true)

    const artifacts = artifactRepo.listByRun(run.id)
    expect(artifacts.length).toBeGreaterThan(0)
  })

  it('cancels queued runs', async () => {
    const executor = new MockExecutor()
    const runner = new JobRunner(executor, { concurrency: 1 })

    const first = createRun()
    const second = createRun()

    runner.enqueue(first.id)
    runner.enqueue(second.id)

    await waitUntil(() => executor.started.includes(first.id))
    await runner.cancel(second.id)

    expect(executor.started).not.toContain(second.id)
    await waitForStatus(second.id, 'canceled')

    executor.complete(first.id)
    await waitForStatus(first.id, 'succeeded')
  })

  it('cancels running runs', async () => {
    const executor = new MockExecutor()
    const runner = new JobRunner(executor, { concurrency: 1 })

    const run = createRun()
    runner.enqueue(run.id)

    await waitUntil(() => executor.started.includes(run.id))
    await runner.cancel(run.id)
    executor.complete(run.id)

    await waitForStatus(run.id, 'canceled')

    const events = runEventRepo.listByRun(run.id)
    const statusPayloads = events
      .filter((event) => event.eventType === 'status')
      .map((event) => event.payload as { status?: string })
    expect(statusPayloads.some((payload) => payload.status === 'canceled')).toBe(true)
  })
})
