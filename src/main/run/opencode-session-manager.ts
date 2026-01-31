import { createOpencodeClient } from '@opencode-ai/sdk/v2/client'
import type { Session, Message, TextPartInput, Event, Part } from '@opencode-ai/sdk/v2/client'

export interface SessionInfo {
  id: string
  title: string
  directory: string
}

export type SessionEvent =
  | {
      type: 'message.updated'
      sessionId: string
      message: Message
    }
  | {
      type: 'message.removed'
      sessionId: string
      messageId: string
    }
  | {
      type: 'message.part.updated'
      sessionId: string
      messageId: string
      part: Part
      delta?: string
    }
  | {
      type: 'message.part.removed'
      sessionId: string
      messageId: string
      partId: string
    }
  | {
      type: 'error'
      sessionId: string
      error: string
    }

export interface SessionMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: number
}

function isMessageEvent(event: Event): boolean {
  return (
    event.type === 'message.updated' ||
    event.type === 'message.removed' ||
    event.type === 'message.part.updated' ||
    event.type === 'message.part.removed'
  )
}

/**
 * Менеджер сессий OpenCode SDK
 * Управляет жизненным циклом сессий для выполнения задач
 */
export class OpenCodeSessionManager {
  private client = createOpencodeClient({
    baseUrl: process.env.OPENCODE_URL || 'http://localhost:4096',
    throwOnError: true,
  })

  private activeSessions = new Map<string, SessionInfo>()
  private eventAbortControllers = new Map<string, AbortController>()
  private eventProcessing = new Map<string, Promise<void>>()
  private messageSessionIndex = new Map<string, string>()

  /**
   * Создать новую сессию для задачи
   */
  async createSession(title: string, directory: string): Promise<SessionInfo> {
    const response = await this.client.session.create({
      directory,
      title,
    })

    if (response.error) {
      throw new Error(`Failed to create session: ${response.error}`)
    }

    const session = response.data as Session

    const sessionInfo: SessionInfo = {
      id: session.id,
      title: session.title || title,
      directory,
    }

    this.activeSessions.set(session.id, sessionInfo)
    return sessionInfo
  }

  /**
   * Отправить промпт в сессию (синхронно)
   */
  async sendPrompt(sessionID: string, prompt: string): Promise<Message> {
    const textPart: TextPartInput = {
      type: 'text',
      text: prompt,
    }

    const response = await this.client.session.prompt({
      sessionID,
      parts: [textPart],
    })

    if (response.error) {
      throw new Error(`Failed to send prompt: ${response.error}`)
    }

    return response.data.info
  }

  /**
   * Отправить промпт в сессию (асинхронно)
   */
  async sendPromptAsync(sessionID: string, prompt: string): Promise<void> {
    const textPart: TextPartInput = {
      type: 'text',
      text: prompt,
    }

    const response = await this.client.session.promptAsync({
      sessionID,
      parts: [textPart],
    })

    if (response.error) {
      throw new Error(`Failed to send async prompt: ${response.error}`)
    }
  }

  /**
   * Получить все сообщения из сессии
   */
  async getMessages(sessionID: string, limit?: number): Promise<SessionMessage[]> {
    const response = await this.client.session.messages({
      sessionID,
      limit,
    })

    if (response.error) {
      throw new Error(`Failed to get messages: ${response.error}`)
    }

    const messages = response.data as Array<{ info: Message; parts: unknown[] }>

    return messages.map((item) => {
      const msg = item.info
      const content = this.buildMessageContent(item.parts as Part[])

      return {
        id: msg.id,
        role: msg.role,
        content,
        timestamp: msg.time.created,
      }
    })
  }

  /**
   * Получить конкретное сообщение
   */
  async getMessage(sessionID: string, messageID: string): Promise<SessionMessage | null> {
    try {
      const response = await this.client.session.message({
        sessionID,
        messageID,
      })

      if (response.error) return null

      const msg = response.data.info
      const content = this.buildMessageContent(response.data.parts as Part[])

      return {
        id: msg.id,
        role: msg.role,
        content,
        timestamp: msg.time.created,
      }
    } catch {
      return null
    }
  }

  /**
   * Получить все сообщения из сессии (сырые части)
   */
  async getMessagesRaw(
    sessionID: string,
    limit?: number
  ): Promise<
    Array<{
      id: string
      role: 'user' | 'assistant'
      timestamp: number
      parts: Part[]
    }>
  > {
    const response = await this.client.session.messages({
      sessionID,
      limit,
    })

    if (response.error) {
      throw new Error(`Failed to get messages: ${response.error}`)
    }

    const messages = response.data as Array<{ info: Message; parts: unknown[] }>

    return messages.map((item) => {
      const msg = item.info

      return {
        id: msg.id,
        role: msg.role,
        parts: item.parts as Part[],
        timestamp: msg.time.created,
      }
    })
  }

  /**
   * Получить информацию о сессии
   */
  async getSessionInfo(sessionID: string): Promise<SessionInfo | null> {
    try {
      const response = await this.client.session.get({ sessionID })

      if (response.error) return null

      const session = response.data as Session

      return {
        id: session.id,
        title: session.title || '',
        directory: session.directory || '',
      }
    } catch {
      return null
    }
  }

  /**
   * Прервать активную сессию
   */
  async abortSession(sessionID: string): Promise<void> {
    const response = await this.client.session.abort({ sessionID })

    if (response.error) {
      throw new Error(`Failed to abort session: ${response.error}`)
    }

    this.activeSessions.delete(sessionID)
  }

  /**
   * Удалить сессию полностью
   */
  async deleteSession(sessionID: string): Promise<void> {
    const response = await this.client.session.delete({ sessionID })

    if (response.error) {
      throw new Error(`Failed to delete session: ${response.error}`)
    }

    this.activeSessions.delete(sessionID)
  }

  /**
   * Получить список активных сессий
   */
  getActiveSessions(): SessionInfo[] {
    return Array.from(this.activeSessions.values())
  }

  /**
   * Проверить, активна ли сессия
   */
  isSessionActive(sessionID: string): boolean {
    return this.activeSessions.has(sessionID)
  }

  /**
   * Подписаться на события сессии через SSE
   */
  async subscribeToSessionEvents(
    sessionID: string,
    callback: (event: SessionEvent) => void
  ): Promise<void> {
    if (this.eventAbortControllers.has(sessionID)) {
      console.log(`[OpenCodeSessionManager] Already subscribed to session ${sessionID}`)
      return
    }

    const abortController = new AbortController()
    this.eventAbortControllers.set(sessionID, abortController)

    const processEvents = async () => {
      try {
        const { signal } = abortController
        const stream = await Promise.resolve(this.client.event.list({}, { signal })).catch(
          () => undefined
        )

        if (!stream) return

        for await (const event of stream) {
          if (signal.aborted) break

          let sessionEvent: SessionEvent

          if (isMessageEvent(event)) {
            if (!this.shouldHandleSessionEvent(sessionID, event)) {
              continue
            }
            switch (event.type) {
              case 'message.updated':
                if (event.properties.info.sessionID) {
                  this.messageSessionIndex.set(
                    event.properties.info.id,
                    event.properties.info.sessionID
                  )
                }
                sessionEvent = {
                  type: 'message.updated',
                  sessionId: sessionID,
                  message: event.properties.info,
                }
                break
              case 'message.removed':
                if (event.properties.messageID) {
                  this.messageSessionIndex.delete(event.properties.messageID)
                }
                sessionEvent = {
                  type: 'message.removed',
                  sessionId: sessionID,
                  messageId: event.properties.messageID,
                }
                break
              case 'message.part.updated':
                sessionEvent = {
                  type: 'message.part.updated',
                  sessionId: sessionID,
                  messageId: event.properties.part.messageID,
                  part: event.properties.part,
                  delta: event.properties.delta,
                }
                break
              case 'message.part.removed':
                sessionEvent = {
                  type: 'message.part.removed',
                  sessionId: sessionID,
                  messageId: event.properties.messageID,
                  partId: event.properties.partID,
                }
                break
              default:
                continue
            }
          } else {
            continue
          }

          callback(sessionEvent)
        }
      } catch (error) {
        console.error(
          `[OpenCodeSessionManager] Event stream error for session ${sessionID}:`,
          error
        )
        callback({
          type: 'error',
          sessionId: sessionID,
          error: error instanceof Error ? error.message : String(error),
        })
      } finally {
        this.eventAbortControllers.delete(sessionID)
        this.eventProcessing.delete(sessionID)
        console.log(`[OpenCodeSessionManager] Event stream ended for session ${sessionID}`)
      }
    }

    const processingPromise = processEvents()
    this.eventProcessing.set(sessionID, processingPromise)
    console.log(`[OpenCodeSessionManager] Subscribed to events for session ${sessionID}`)

    await processingPromise
  }

  /**
   * Отписаться от событий сессии
   */
  async unsubscribeFromSessionEvents(sessionID: string): Promise<void> {
    const abortController = this.eventAbortControllers.get(sessionID)
    if (abortController) {
      abortController.abort()
      console.log(`[OpenCodeSessionManager] Unsubscribed from events for session ${sessionID}`)
      this.eventAbortControllers.delete(sessionID)

      const processingPromise = this.eventProcessing.get(sessionID)
      if (processingPromise) {
        await processingPromise.catch(() => {})
      }
    }
  }

  /**
   * Проверить, есть ли активная подписка на события сессии
   */
  isSubscribedToSessionEvents(sessionID: string): boolean {
    return this.eventAbortControllers.has(sessionID)
  }

  private shouldHandleSessionEvent(sessionID: string, event: Event): boolean {
    switch (event.type) {
      case 'message.updated':
        return event.properties.info.sessionID === sessionID
      case 'message.removed':
        return event.properties.sessionID === sessionID
      case 'message.part.updated': {
        const messageId = event.properties.part.messageID
        const knownSession = this.messageSessionIndex.get(messageId)
        return !knownSession || knownSession === sessionID
      }
      case 'message.part.removed': {
        const messageId = event.properties.messageID
        const knownSession = this.messageSessionIndex.get(messageId)
        return !knownSession || knownSession === sessionID
      }
      default:
        return false
    }
  }

  private buildMessageContent(parts: Part[]): string {
    const textParts: string[] = []
    const reasoningParts: string[] = []

    for (const part of parts) {
      if (part.type === 'text') {
        if (!part.ignored) {
          textParts.push(part.text)
        }
        continue
      }
      if (part.type === 'reasoning') {
        reasoningParts.push(part.text)
      }
    }

    const text = textParts.join('\n').trim()
    const reasoning = reasoningParts.join('\n').trim()

    if (!text && !reasoning && parts.length > 0) {
      const first = parts[0]
      const messageId = first.messageID
      const sessionId = first.sessionID
      const partTypes = parts.map((part) => part.type).join(', ')
      console.log(
        `[OpenCodeSessionManager] Empty content for message ${messageId} in session ${sessionId}. Parts: ${partTypes}`
      )
    }

    if (!reasoning) {
      return text
    }

    if (!text) {
      return `[thoughts]\n${reasoning}`
    }

    return `${text}\n\n[thoughts]\n${reasoning}`
  }
}

export const sessionManager = new OpenCodeSessionManager()
