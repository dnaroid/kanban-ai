import { describe, expect, it, vi } from 'vitest'

const { createSnapshot } = vi.hoisted(() => ({
  createSnapshot: vi.fn((input: { payload: unknown }) => ({ id: 'snap-1', ...input })),
}))

vi.mock('../db/context-snapshot-repository.js', () => ({
  contextSnapshotRepo: { create: createSnapshot },
}))

vi.mock('../db/index.js', () => ({
  dbManager: {
    connect: () => ({
      prepare: () => ({
        get: () => ({
          id: 'release-notes',
          name: 'Release Notes',
          description: 'Release notes role',
          presetJson: '{}',
        }),
      }),
    }),
  },
}))

vi.mock('../db/project-repository.js', () => ({
  projectRepo: {
    getById: () => ({ id: 'project-1', name: 'Project', path: '/repo' }),
  },
}))

vi.mock('../db/task-repository.js', () => ({
  taskRepo: {
    getById: (id: string) => ({ id, title: 'Task title', projectId: 'project-1' }),
  },
}))

vi.mock('../db/release-repository.js', () => ({
  releaseRepo: {
    getById: () => ({
      id: 'release-1',
      projectId: 'project-1',
      name: 'v0.3.0',
      status: 'draft',
      targetDate: null,
      notesMd: '',
      createdAt: '',
      updatedAt: '',
    }),
  },
}))

vi.mock('../db/release-item-repository.js', () => ({
  releaseItemRepo: {
    listByRelease: () => [
      {
        id: 'item-1',
        releaseId: 'release-1',
        taskId: 'task-1',
        prId: 'pr-1',
        state: 'planned',
        createdAt: '',
        updatedAt: '',
      },
    ],
  },
}))

vi.mock('../db/pull-request-repository.js', () => ({
  pullRequestRepo: {
    getByTaskId: () => ({ title: 'PR title' }),
  },
}))

vi.mock('../db/board-repository.js', () => ({
  boardRepo: { getColumns: () => [] },
}))

import { buildReleaseNotesSnapshot } from './context-snapshot-builder'

describe('buildReleaseNotesSnapshot', () => {
  it('includes release items with task and PR titles', () => {
    const snapshot = buildReleaseNotesSnapshot({
      releaseId: 'release-1',
      taskId: 'task-1',
      roleId: 'release-notes',
      mode: 'execute',
    })

    expect(snapshot.id).toBe('snap-1')
    expect(createSnapshot).toHaveBeenCalledTimes(1)
    const payload = createSnapshot.mock.calls[0][0].payload as {
      release: { id: string }
      items: { taskTitle: string; prTitle: string }[]
    }
    expect(payload.release.id).toBe('release-1')
    expect(payload.items[0].taskTitle).toBe('Task title')
    expect(payload.items[0].prTitle).toBe('PR title')
  })
})
