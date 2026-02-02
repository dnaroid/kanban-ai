import type { Event, Message, Part, Session, TextPartInput } from '@opencode-ai/sdk/v2/client'
import { createOpencodeClient } from '@opencode-ai/sdk/v2/client'

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

const resolveOpencodeEventList = (
  client: unknown
): ((params: unknown, options?: unknown) => AsyncIterable<unknown>) | null => {
  const event = (client as Record<string, unknown>)['event'] as Record<string, unknown> | undefined
  const list = event?.['list']
  return typeof list === 'function'
    ? (list as (params: unknown, options?: unknown) => AsyncIterable<unknown>)
    : null
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
  private activeSessions = new Map<string, SessionInfo>()
  private sessionClients = new Map<string, ReturnType<typeof createOpencodeClient>>()
  private eventAbortControllers = new Map<string, AbortController>()
  private eventProcessing = new Map<string, Promise<void>>()
  private messageSessionIndex = new Map<string, string>()

  private async createClientForDirectory(directory: string) {
    const baseUrl = process.env.OPENCODE_URL || 'http://127.0.0.1:4096'
    return createOpencodeClient({
      baseUrl,
      throwOnError: true,
      directory,
    })
  }

  private async getSessionClient(sessionID: string, directory: string) {
    const existing = this.sessionClients.get(sessionID)
    if (existing) return existing
    const client = await this.createClientForDirectory(directory)
    this.sessionClients.set(sessionID, client)
    return client
  }

  /**
   * Создать новую сессию для задачи
   */
  async createSession(title: string, directory: string): Promise<SessionInfo> {
    console.log('[OpenCodeSessionManager] createSession START', {
      title,
      directory,
    })

    const client = await this.createClientForDirectory(directory)

    const response = await client.session.create({
      directory,
      title,
    })

    if (response.error) {
      throw new Error(`Failed to create session: ${response.error}`)
    }

    const session = response.data as Session
    console.log('[OpenCodeSessionManager] createSession:created', {
      sessionId: session.id,
      projectId: (session as { projectID?: string }).projectID,
    })

    const sessionInfo: SessionInfo = {
      id: session.id,
      title: session.title || title,
      directory,
    }

    this.activeSessions.set(session.id, sessionInfo)
    this.sessionClients.set(session.id, client)

    return sessionInfo
  }

  /**
   * Отправить промпт в сессию (синхронно)
   * Пример использования:
   * ```typescript
   * const response = await sessionManager.sendPrompt(sessionId, "Текст запроса")
   * console.log('Ответ:', response)
   * ```
   */
  async sendPrompt(sessionID: string, prompt: string): Promise<Message> {
    const textPart: TextPartInput = {
      type: 'text',
      text: prompt,
    }

    console.log('[OpenCodeSessionManager] sendPrompt START', {
      sessionID,
      promptLength: prompt.length,
    })

    const sessionInfo = this.activeSessions.get(sessionID)
    if (!sessionInfo) {
      throw new Error(`Session not found: ${sessionID}`)
    }

    console.log('[OpenCodeSessionManager] sendPrompt CLIENT', {
      sessionID,
      directory: sessionInfo.directory,
    })

    try {
      const client = await this.getSessionClient(sessionID, sessionInfo.directory)
      const response = await client.session.prompt({
        sessionID,
        parts: [textPart],
      })

      console.log('[OpenCodeSessionManager] sendPrompt RESPONSE', {
        sessionID,
        hasError: !!response.error,
        hasData: !!response.data,
        dataKeys: response.data ? Object.keys(response.data) : [],
        data: JSON.stringify(response.data).substring(0, 200),
      })

      if (response.error) {
        console.error('[OpenCodeSessionManager] sendPrompt ERROR:', response.error)
        throw new Error(`Failed to send prompt: ${response.error}`)
      }

      const messageInfo = response.data?.info

      console.log('[OpenCodeSessionManager] sendPrompt OK', {
        sessionID,
        messageId: messageInfo?.id,
        hasInfo: !!messageInfo,
        infoKeys: messageInfo ? Object.keys(messageInfo) : [],
      })

      return messageInfo as Message
    } catch (error) {
      console.error('[OpenCodeSessionManager] sendPrompt CATCH:', error)
      throw error
    }
  }

  /**
   * Отправить промпт в сессию (асинхронно)
   */
  async sendPromptAsync(sessionID: string, prompt: string): Promise<void> {
    const textPart: TextPartInput = {
      type: 'text',
      text: prompt,
    }

    console.log('[OpenCodeSessionManager] sendPromptAsync START', {
      sessionID,
      prompt: prompt.substring(0, 100), // логируем первые 100 символов
    })

    const sessionInfo = this.activeSessions.get(sessionID)
    if (!sessionInfo) {
      throw new Error(`Session not found: ${sessionID}`)
    }

    const client = await this.getSessionClient(sessionID, sessionInfo.directory)
    const response = await client.session.promptAsync({
      sessionID,
      parts: [textPart],
    })

    console.log('[OpenCodeSessionManager] sendPromptAsync RESPONSE', {
      hasError: !!response.error,
      error: response.error,
      hasData: !!response.data,
      responseType: typeof response,
    })

    if (response.error) {
      console.error('[OpenCodeSessionManager] sendPromptAsync ERROR:', response.error)
      throw new Error(`Failed to send async prompt: ${response.error}`)
    }

    // Диагностика: проверяем состояние сессии после асинхронной отправки
    console.log('[OpenCodeSessionManager] sendPromptAsync checking session state', { sessionID })
    try {
      const checkResponse = await client.session.messages({ sessionID, limit: 1 })
      console.log('[OpenCodeSessionManager] sendPromptAsync messages check', {
        hasError: !!checkResponse.error,
        messageCount: checkResponse.data ? checkResponse.data.length : 0,
      })
    } catch (e) {
      console.error('[OpenCodeSessionManager] sendPromptAsync messages check failed', e)
    }

    console.log('[OpenCodeSessionManager] sendPromptAsync OK', { sessionID })
  }

  /**
   * Получить все сообщения из сессии
   */
  async getMessages(sessionID: string, limit?: number): Promise<SessionMessage[]> {
    const sessionInfo = this.activeSessions.get(sessionID)
    if (!sessionInfo) {
      throw new Error(`Session not found: ${sessionID}`)
    }

    const client = await this.getSessionClient(sessionID, sessionInfo.directory)
    const response = await client.session.messages({
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
    const sessionInfo = this.activeSessions.get(sessionID)
    if (!sessionInfo) {
      throw new Error(`Session not found: ${sessionID}`)
    }

    try {
      const client = await this.getSessionClient(sessionID, sessionInfo.directory)
      const response = (await client.session.message({
        sessionID,
        messageID,
      })) as unknown as {
        data: { info: Record<string, unknown>; parts?: unknown[] }
        error?: { message?: string }
      }

      if (response.error) return null

      const info = response.data.info as Record<string, unknown>
      const parts = (response.data.parts as Part[]) || []

      let content = ''
      const rawContent = info['content']

      if (typeof rawContent === 'string' && rawContent) {
        content = rawContent
      } else if (parts.length > 0) {
        content = this.buildMessageContent(parts)
      }

      // Fallback: if content is still empty, try to find it in recent messages via getMessagesRaw (which definitely returns parts)
      if (!content) {
        try {
          // Fetch last 20 messages to find this one with parts
          const recentMessages = await this.getMessagesRaw(sessionID, 20)
          const found = recentMessages.find((m) => m.id === String(info['id']))
          if (found && found.parts.length > 0) {
            content = this.buildMessageContent(found.parts, false)
          }
        } catch (e) {
          console.warn(
            `[OpenCodeSessionManager] Failed to fetch recent messages for fallback for message ${info['id']}: ${e}`
          )
        }
      }

      const id = String(info['id'] ?? '')
      const role = info['role'] === 'user' ? 'user' : 'assistant'
      const time = (info['time'] as Record<string, unknown>) ?? {}
      const timestampValue = time['created']
      const timestamp =
        typeof timestampValue === 'number' ? timestampValue : Number(timestampValue ?? 0)

      return {
        id,
        role,
        content,
        timestamp,
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
    const sessionInfo = this.activeSessions.get(sessionID)
    if (!sessionInfo) {
      throw new Error(`Session not found: ${sessionID}`)
    }

    let response
    try {
      console.log('[OpenCodeSessionManager] getMessagesRaw CLIENT', {
        sessionID,
        directory: sessionInfo.directory,
      })

      const client = await this.getSessionClient(sessionID, sessionInfo.directory)
      response = await client.session.messages({
        sessionID,
        limit,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (message.includes('NotFoundError') || message.includes('ENOENT')) {
        return []
      }
      throw error
    }

    if (response.error) {
      const message =
        typeof response.error === 'string' ? response.error : JSON.stringify(response.error)
      if (message.includes('NotFoundError') || message.includes('ENOENT')) {
        return []
      }
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
    const sessionInfo = this.activeSessions.get(sessionID)
    if (!sessionInfo) {
      return null
    }

    try {
      const client = await this.getSessionClient(sessionID, sessionInfo.directory)
      const response = await client.session.get({ sessionID })

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
    const sessionInfo = this.activeSessions.get(sessionID)
    if (!sessionInfo) {
      throw new Error(`Session not found: ${sessionID}`)
    }

    const client = await this.getSessionClient(sessionID, sessionInfo.directory)
    const response = await client.session.abort({ sessionID })

    if (response.error) {
      throw new Error(`Failed to abort session: ${response.error}`)
    }

    this.activeSessions.delete(sessionID)
  }

  /**
   * Удалить сессию полностью
   */
  async deleteSession(sessionID: string): Promise<void> {
    const sessionInfo = this.activeSessions.get(sessionID)
    if (!sessionInfo) {
      throw new Error(`Session not found: ${sessionID}`)
    }

    const client = await this.getSessionClient(sessionID, sessionInfo.directory)
    const response = await client.session.delete({ sessionID })

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

    const sessionInfo = this.activeSessions.get(sessionID)
    if (!sessionInfo) {
      throw new Error(`Session not found: ${sessionID}`)
    }

    const client = await this.getSessionClient(sessionID, sessionInfo.directory)

    const abortController = new AbortController()
    this.eventAbortControllers.set(sessionID, abortController)

    const processEvents = async () => {
      try {
        const { signal } = abortController
        const listEvents = resolveOpencodeEventList(client)
        if (!listEvents) {
          throw new Error('Event stream is unavailable')
        }

        const stream = await Promise.resolve(listEvents({}, { signal })).catch((error) => {
          throw error instanceof Error ? error : new Error(String(error))
        })

        if (!stream) {
          throw new Error('Event stream is unavailable')
        }

        for await (const event of stream as AsyncIterable<Event>) {
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

  private buildMessageContent(parts: Part[], withReasoning = false): string {
    const textParts: string[] = []
    const reasoningParts: string[] = []

    for (const part of parts) {
      if (part.type === 'text') {
        if (!part.ignored) {
          textParts.push(part.text)
        }
        continue
      }
      if (withReasoning && part.type === 'reasoning') {
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
