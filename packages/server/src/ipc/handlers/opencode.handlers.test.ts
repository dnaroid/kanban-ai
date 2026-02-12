import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  ipcMainHandle: vi.fn(),
  subscribeToSessionEvents: vi.fn(async () => undefined),
  unsubscribeFromSessionEvents: vi.fn(async () => undefined),
  isSubscribedToSessionEvents: vi.fn(() => false),
  getSessionInfo: vi.fn(async () => null),
  getActiveSessions: vi.fn(() => []),
  getTodos: vi.fn(async () => []),
  logProviders: vi.fn(async () => undefined),
  getSessionMessages: vi.fn(async () => []),
  getAllModels: vi.fn(() => []),
  getEnabledModels: vi.fn(() => []),
  syncFromSdkModels: vi.fn(),
  generateUserStory: vi.fn(async () => 'run-1'),
  getTaskById: vi.fn(() => ({ status: 'queued' })),
  updateTaskAndEmit: vi.fn(() => ({ ok: true, value: null })),
  createOpencodeClientInstance: vi.fn(() => ({
    provider: {
      list: vi.fn(async () => ({ data: { all: [], connected: [] } })),
    },
  })),
}))

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn(() => '/tmp/test-user-data'),
  },
  ipcMain: {
    handle: mocks.ipcMainHandle,
  },
}))

vi.mock('../../run/opencode-session-manager', () => ({
  sessionManager: {
    subscribeToSessionEvents: mocks.subscribeToSessionEvents,
    unsubscribeFromSessionEvents: mocks.unsubscribeFromSessionEvents,
    isSubscribedToSessionEvents: mocks.isSubscribedToSessionEvents,
    getSessionInfo: mocks.getSessionInfo,
    getActiveSessions: mocks.getActiveSessions,
    getTodos: mocks.getTodos,
    logProviders: mocks.logProviders,
  },
}))

vi.mock('../../run/opencode-session-worker.js', () => ({
  opencodeSessionWorker: {
    getSessionMessages: mocks.getSessionMessages,
  },
}))

vi.mock('../../db/opencode-model-repository', () => ({
  opencodeModelRepo: {
    getAll: mocks.getAllModels,
    getEnabled: mocks.getEnabledModels,
    syncFromSdkModels: mocks.syncFromSdkModels,
    updateDifficulty: vi.fn(),
    toggleEnabled: vi.fn(),
  },
}))

vi.mock('../../run/run-service.js', () => ({
  opencodeExecutor: {
    generateUserStory: mocks.generateUserStory,
  },
}))

vi.mock('../../db/task-repository', () => ({
  taskRepo: {
    getById: mocks.getTaskById,
  },
}))

type HandlerFn = (event: { sender: MockSender }, input: unknown) => Promise<unknown>

type MockSender = {
  id: number
  send: ReturnType<typeof vi.fn>
  once: ReturnType<typeof vi.fn>
}

const loadModuleAndRegister = async () => {
  const module = await import('./opencode.handlers.js')
  module.registerOpenCodeHandlers({
    createOpencodeClientInstance: mocks.createOpencodeClientInstance,
    updateTaskAndEmit: mocks.updateTaskAndEmit,
  } as never)
}

const getRegisteredHandler = (channel: string): HandlerFn => {
  const call = mocks.ipcMainHandle.mock.calls.find(([name]) => name === channel)
  if (!call) {
    throw new Error(`Handler for channel ${channel} was not registered`)
  }
  return call[1] as HandlerFn
}

const createMockEvent = (rendererId: number) => {
  const listeners = new Map<string, () => void>()
  const sender: MockSender = {
    id: rendererId,
    send: vi.fn(),
    once: vi.fn((eventName: string, callback: () => void) => {
      listeners.set(eventName, callback)
      return sender
    }),
  }

  return {
    event: { sender },
    trigger: (eventName: string) => {
      const callback = listeners.get(eventName)
      if (!callback) throw new Error(`Missing listener for ${eventName}`)
      callback()
    },
  }
}

describe('registerOpenCodeHandlers subscription lifecycle', () => {
  beforeEach(async () => {
    vi.resetModules()
    mocks.ipcMainHandle.mockReset()
    mocks.subscribeToSessionEvents.mockClear()
    mocks.unsubscribeFromSessionEvents.mockClear()
    await loadModuleAndRegister()
  })

  it('treats duplicate subscribe as idempotent for the same renderer/session', async () => {
    const handler = getRegisteredHandler('opencode:subscribeToEvents')
    const { event } = createMockEvent(101)

    const first = await handler(event, { sessionId: 'ses-1' })
    const second = await handler(event, { sessionId: 'ses-1' })

    expect(first).toEqual({ ok: true, subscribed: true })
    expect(second).toEqual({ ok: true, subscribed: true })
    expect(mocks.subscribeToSessionEvents).toHaveBeenCalledTimes(1)
    expect(mocks.subscribeToSessionEvents).toHaveBeenCalledWith(
      'ses-1',
      'renderer:101',
      expect.any(Function)
    )
  })

  it('accepts legacy sessionID payload and canonicalizes subscription', async () => {
    const handler = getRegisteredHandler('opencode:subscribeToEvents')
    const { event } = createMockEvent(102)

    const result = await handler(event, { sessionID: 'ses-legacy' })

    expect(result).toEqual({ ok: true, subscribed: true })
    expect(mocks.subscribeToSessionEvents).toHaveBeenCalledWith(
      'ses-legacy',
      'renderer:102',
      expect.any(Function)
    )
  })

  it('does not unsubscribe manager when renderer is not subscribed to the session', async () => {
    const handler = getRegisteredHandler('opencode:unsubscribeFromEvents')
    const { event } = createMockEvent(103)

    const result = await handler(event, { sessionId: 'ses-missing' })

    expect(result).toEqual({ ok: true, subscribed: false })
    expect(mocks.unsubscribeFromSessionEvents).not.toHaveBeenCalled()
  })

  it('cleans up all renderer subscriptions on destroyed event', async () => {
    const subscribeHandler = getRegisteredHandler('opencode:subscribeToEvents')
    const { event, trigger } = createMockEvent(104)

    await subscribeHandler(event, { sessionId: 'ses-a' })
    await subscribeHandler(event, { sessionId: 'ses-b' })

    trigger('destroyed')
    await Promise.resolve()

    expect(mocks.unsubscribeFromSessionEvents).toHaveBeenCalledTimes(2)
    expect(mocks.unsubscribeFromSessionEvents).toHaveBeenCalledWith('ses-a', 'renderer:104')
    expect(mocks.unsubscribeFromSessionEvents).toHaveBeenCalledWith('ses-b', 'renderer:104')
  })
})
