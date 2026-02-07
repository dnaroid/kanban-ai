import fs from 'node:fs/promises'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { OpenCodeSessionManager } from './opencode-session-manager.js'

type MessagePartUpdatedEvent = {
  type: 'message.part.updated'
  properties: {
    part: {
      id: string
      messageID: string
      sessionID?: string
    }
    delta?: string
  }
}

type MessagePartRemovedEvent = {
  type: 'message.part.removed'
  properties: {
    messageID: string
    partID: string
    sessionID?: string
  }
}

const setMessageSessionOwner = (
  manager: OpenCodeSessionManager,
  messageId: string,
  sessionId: string
): void => {
  const index = Reflect.get(manager, 'messageSessionIndex') as Map<string, string>
  index.set(messageId, sessionId)
}

const shouldHandle = (
  manager: OpenCodeSessionManager,
  sessionId: string,
  event: MessagePartUpdatedEvent | MessagePartRemovedEvent
): boolean => {
  const fn = Reflect.get(manager, 'shouldHandleSessionEvent') as (
    sessionID: string,
    evt: MessagePartUpdatedEvent | MessagePartRemovedEvent
  ) => boolean

  return fn.call(manager, sessionId, event)
}

describe('OpenCodeSessionManager session event filtering', () => {
  it('accepts message.part.updated for current session even with stale message index', () => {
    const manager = new OpenCodeSessionManager()
    const currentSessionId = 'ses-current'
    const oldSessionId = 'ses-old'
    const messageId = 'msg-1'

    setMessageSessionOwner(manager, messageId, oldSessionId)

    const event: MessagePartUpdatedEvent = {
      type: 'message.part.updated',
      properties: {
        part: {
          id: 'part-1',
          messageID: messageId,
          sessionID: currentSessionId,
        },
      },
    }

    expect(shouldHandle(manager, currentSessionId, event)).toBe(true)
  })

  it('rejects message.part.removed when explicit event session differs', () => {
    const manager = new OpenCodeSessionManager()
    const currentSessionId = 'ses-current'
    const messageId = 'msg-1'

    setMessageSessionOwner(manager, messageId, currentSessionId)

    const event: MessagePartRemovedEvent = {
      type: 'message.part.removed',
      properties: {
        messageID: messageId,
        partID: 'part-1',
        sessionID: 'ses-other',
      },
    }

    expect(shouldHandle(manager, currentSessionId, event)).toBe(false)
  })
})

describe('OpenCodeSessionManager filesystem fallback', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('reads only latest messages by sorted filename when limit is set', async () => {
    const manager = new OpenCodeSessionManager()
    const storageReader = Reflect.get(manager, 'storageReader') as {
      getOpenCodeStoragePath: () => string
      getMessagesFromFilesystem: (
        sessionId: string,
        limit?: number
      ) => Promise<Array<{ id: string; content: string; timestamp: number }>>
    }
    vi.spyOn(storageReader, 'getOpenCodeStoragePath').mockReturnValue('/tmp/opencode-storage')

    const readdirSpy = vi.spyOn(fs, 'readdir')
    readdirSpy.mockImplementation((async (...args: unknown[]) => {
      const value = String(args[0])
      if (value.endsWith('/message/ses-1')) {
        return ['msg_003.json', 'msg_001.json', 'msg_002.json']
      }
      if (value.endsWith('/part/msg-2')) {
        return ['prt_2.json', 'prt_1.json']
      }
      if (value.endsWith('/part/msg-3')) {
        return []
      }
      throw new Error(`Unexpected readdir path: ${value}`)
    }) as never)

    const readFileSpy = vi.spyOn(fs, 'readFile').mockImplementation(async (filePath) => {
      const value = String(filePath)
      if (value.endsWith('/message/ses-1/msg_002.json')) {
        return JSON.stringify({
          id: 'msg-2',
          role: 'assistant',
          time: { created: 200 },
        })
      }
      if (value.endsWith('/message/ses-1/msg_003.json')) {
        return JSON.stringify({
          id: 'msg-3',
          role: 'assistant',
          content: 'final',
          time: { created: 300 },
        })
      }
      if (value.endsWith('/part/msg-2/prt_1.json')) {
        return JSON.stringify({
          id: 'part-1',
          type: 'text',
          text: 'first',
          messageID: 'msg-2',
          sessionID: 'ses-1',
        })
      }
      if (value.endsWith('/part/msg-2/prt_2.json')) {
        return JSON.stringify({
          id: 'part-2',
          type: 'text',
          text: 'second',
          messageID: 'msg-2',
          sessionID: 'ses-1',
        })
      }
      throw new Error(`Unexpected readFile path: ${value}`)
    })

    const getMessagesFromFilesystem = storageReader.getMessagesFromFilesystem.bind(storageReader)
    const messages = await getMessagesFromFilesystem('ses-1', 2)

    expect(messages.map((message: { id: string }) => message.id)).toEqual(['msg-2', 'msg-3'])
    expect(messages[0]?.content).toBe('first\nsecond')
    expect(messages[1]?.content).toBe('final')
    expect(
      readFileSpy.mock.calls.some(([filePath]) =>
        String(filePath).endsWith('/message/ses-1/msg_001.json')
      )
    ).toBe(false)
  })
})
