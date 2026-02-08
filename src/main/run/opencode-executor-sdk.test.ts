import { beforeEach, describe, expect, it, vi } from 'vitest'

const testState = vi.hoisted(() => ({
  modelName: 'anthropic/claude-3-5-haiku-latest',
  projectPath: '/tmp/test-project',
  sessionCreatedId: 'ses-test',
  taskId: 'task-1',
  userDataPath: '/tmp/kanban-ai-test',
}))

vi.mock('electron', () => ({
  app: {
    getPath: () => testState.userDataPath,
  },
}))

const sessionMocks = vi.hoisted(() => ({
  createSession: vi.fn(async () => ({ id: testState.sessionCreatedId, title: '', directory: '' })),
  sendPromptAsync: vi.fn(async () => undefined),
  abortSession: vi.fn(async () => undefined),
}))

const repoMocks = vi.hoisted(() => ({
  taskRepo: {
    getById: vi.fn(() => ({
      id: testState.taskId,
      projectId: 'project-1',
      title: 'Test Task',
      status: 'queued',
      modelName: testState.modelName,
    })),
  },
  projectRepo: {
    getById: vi.fn(() => ({
      id: 'project-1',
      path: testState.projectPath,
    })),
  },
  runRepo: {
    create: vi.fn(() => ({ id: 'run-1' })),
    update: vi.fn(() => undefined),
    getById: vi.fn(() => null),
  },
  runEventRepo: {
    create: vi.fn(() => undefined),
  },
}))

vi.mock('../db/task-repository.js', () => ({
  taskRepo: repoMocks.taskRepo,
}))

vi.mock('../db/project-repository.js', () => ({
  projectRepo: repoMocks.projectRepo,
}))

vi.mock('../db/run-repository.js', () => ({
  runRepo: repoMocks.runRepo,
}))

vi.mock('../db/run-event-repository.js', () => ({
  runEventRepo: repoMocks.runEventRepo,
}))

vi.mock('../db/tag-repository.js', () => ({
  tagRepo: {
    listAll: vi.fn(() => []),
  },
}))

vi.mock('./opencode-session-manager.js', () => ({
  sessionManager: sessionMocks,
}))

vi.mock('./opencode-session-worker.js', () => ({
  opencodeSessionWorker: {
    startTracking: vi.fn(() => undefined),
  },
}))

vi.mock('./context-snapshot-builder.js', () => ({
  ContextSnapshotBuilder: class {
    build = vi.fn((params: { taskId: string; roleId: string; mode: string }) => ({
      ok: true,
      data: {
        id: 'snapshot-1',
        kind: 'run_input_v1',
        taskId: params.taskId,
        payload: {},
        hash: 'hash',
        createdAt: new Date().toISOString(),
      },
    }))
  },
}))

vi.mock('./prompts/task.js', () => ({
  buildTaskPrompt: vi.fn(() => 'PROMPT'),
}))

beforeEach(() => {
  sessionMocks.createSession.mockClear()
  sessionMocks.sendPromptAsync.mockClear()
  sessionMocks.abortSession.mockClear()
  repoMocks.taskRepo.getById.mockClear()
  repoMocks.projectRepo.getById.mockClear()
  repoMocks.runRepo.update.mockClear()
  repoMocks.runRepo.getById.mockClear()
  repoMocks.runEventRepo.create.mockClear()
})

describe('OpenCodeExecutorSDK', () => {
  it('passes task modelName when launching run prompt', async () => {
    const { OpenCodeExecutorSDK } = await import('./opencode-executor-sdk.js')

    const executor = new OpenCodeExecutorSDK() as any
    await executor.startTaskPrompt({
      taskId: testState.taskId,
      prompt: 'PROMPT',
      roleId: 'ba',
      kind: 'task-run',
      sessionTitle: 'Test Session',
    })

    expect(sessionMocks.createSession).toHaveBeenCalledTimes(1)
    expect(sessionMocks.sendPromptAsync).toHaveBeenCalledTimes(1)
    expect(sessionMocks.sendPromptAsync).toHaveBeenCalledWith(
      testState.sessionCreatedId,
      'PROMPT',
      testState.modelName
    )
  })
})
