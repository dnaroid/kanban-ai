import { describe, expect, it } from 'vitest'
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
