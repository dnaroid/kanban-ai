import type { Event, Message, Part, Session, TextPartInput } from '@opencode-ai/sdk/v2/client'
import { createOpencodeClient } from '@opencode-ai/sdk/v2/client'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

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
  client: unknown,
  directory: string
): ((params: unknown, options?: unknown) => AsyncIterable<unknown>) | null => {
  const root = client as Record<string, unknown>
  console.log('[OpenCodeSessionManager] resolveOpencodeEventList: client keys:', Object.keys(root))
  
  const event = root['event'] as Record<string, unknown> | undefined
  
  if (event && typeof event['subscribe'] === 'function') {
    console.log('[OpenCodeSessionManager] resolveOpencodeEventList: found client.event.subscribe')
    // Wrap the subscribe method to pass directory parameter
    return (params: unknown, options?: unknown) => {
      return event['subscribe']({ directory }, options) as AsyncIterable<unknown>
    }
  }
  
  console.log('[OpenCodeSessionManager] resolveOpencodeEventList: subscribe method not found')
  return null
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

    const sessionInfo = this.activeSessions.get(sessionID)
    if (!sessionInfo) {
      throw new Error(`Session not found: ${sessionID}`)
    }

    try {
      const client = await this.getSessionClient(sessionID, sessionInfo.directory)
      const response = await client.session.prompt({
        sessionID,
        parts: [textPart],
      })

      if (response.error) {
        console.error('[OpenCodeSessionManager] sendPrompt ERROR:', response.error)
        throw new Error(`Failed to send prompt: ${response.error}`)
      }

      const messageInfo = response.data?.info

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

    const directory = await this.resolveSessionDirectory(sessionID)
    if (!directory) {
      throw new Error(`Session not found: ${sessionID}`)
    }

    const client = await this.getSessionClient(sessionID, directory)
    const response = await client.session.promptAsync({
      sessionID,
      parts: [textPart],
    })

    if (response.error) {
      console.error('[OpenCodeSessionManager] sendPromptAsync ERROR:', response.error)
      throw new Error(`Failed to send async prompt: ${response.error}`)
    }
  }

  async getMessages(sessionID: string, limit?: number): Promise<SessionMessage[]> {
    const sessionInfo = this.activeSessions.get(sessionID)
    if (!sessionInfo) {
      const messages = await this.getMessagesFromFilesystem(sessionID, limit)
      if (messages.length > 0) {
        return messages.map((msg) => ({
          id: msg.id,
          role: msg.role,
          content: '',
          timestamp: msg.timestamp,
        }))
      }
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
      content: string
      timestamp: number
      parts: Part[]
    }>
  > {
    const directory = await this.resolveSessionDirectory(sessionID)
    if (!directory) {
      console.log(
        '[OpenCodeSessionManager] getMessagesRaw: session not in active sessions, loading from filesystem',
        { sessionID }
      )
      return this.getMessagesFromFilesystem(sessionID, limit)
    }

    let response
    try {
      console.log('[OpenCodeSessionManager] getMessagesRaw CLIENT', {
        sessionID,
        directory,
      })

      const client = await this.getSessionClient(sessionID, directory)
      response = await client.session.messages({
        sessionID,
        limit,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (message.includes('NotFoundError') || message.includes('ENOENT')) {
        console.log(
          '[OpenCodeSessionManager] getMessagesRaw: session not found via SDK, loading from filesystem',
          { sessionID }
        )
        return this.getMessagesFromFilesystem(sessionID, limit)
      }
      throw error
    }

    if (response.error) {
      const message =
        typeof response.error === 'string' ? response.error : JSON.stringify(response.error)
      if (message.includes('NotFoundError') || message.includes('ENOENT')) {
        console.log('[OpenCodeSessionManager] getMessagesRaw: SDK error, loading from filesystem', {
          sessionID,
        })
        return this.getMessagesFromFilesystem(sessionID, limit)
      }
      throw new Error(`Failed to get messages: ${response.error}`)
    }

    const messages = response.data as Array<{ info: Message; parts: unknown[] }>

    return messages.map((item) => {
      const msg = item.info
      const parts = item.parts as Part[]
      const content = this.buildMessageContent(parts)

      return {
        id: msg.id,
        role: msg.role,
        content,
        parts,
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
    const directory = await this.resolveSessionDirectory(sessionID)
    if (!directory) {
      throw new Error(`Session not found: ${sessionID}`)
    }

    const client = await this.getSessionClient(sessionID, directory)
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

    const directory = await this.resolveSessionDirectory(sessionID)
    if (!directory) {
      console.warn(
        `[OpenCodeSessionManager] Session directory not found for ${sessionID}, cannot subscribe to SSE`
      )
      callback({
        type: 'error',
        sessionId: sessionID,
        error: `Session not found: ${sessionID}`,
      })
      return
    }

    const client = await this.getSessionClient(sessionID, directory)

    const abortController = new AbortController()
    this.eventAbortControllers.set(sessionID, abortController)

    const processEvents = async () => {
      try {
        console.log(
          `[OpenCodeSessionManager] Starting processEvents for session ${sessionID}, directory: ${directory}`
        )
        const { signal } = abortController
        const listEvents = resolveOpencodeEventList(client, directory)
        if (!listEvents) {
          const errorMessage = 'Event stream is unavailable'
          console.warn(
            `[OpenCodeSessionManager] Event stream error for session ${sessionID}: ${errorMessage}`
          )
          callback({
            type: 'error',
            sessionId: sessionID,
            error: errorMessage,
          })
          return
        }

        console.log(`[OpenCodeSessionManager] Calling listEvents for session ${sessionID}`)
        const streamPromise = listEvents({}, { signal })
        console.log(`[OpenCodeSessionManager] Stream promise created, awaiting...`)
        
        const streamResult = await Promise.resolve(streamPromise).catch((error) => {
          console.error(
            `[OpenCodeSessionManager] Failed to create stream for session ${sessionID}:`,
            error
          )
          throw error instanceof Error ? error : new Error(String(error))
        })

        console.log(`[OpenCodeSessionManager] Stream result type:`, typeof streamResult, streamResult)

        if (!streamResult) {
          const errorMessage = 'Event stream is unavailable'
          console.warn(
            `[OpenCodeSessionManager] Event stream error for session ${sessionID}: ${errorMessage}`
          )
          callback({
            type: 'error',
            sessionId: sessionID,
            error: errorMessage,
          })
          return
        }

        // Check if streamResult has a stream property (SSE response format)
        const stream = (streamResult as any).stream ?? (streamResult as any).data ?? streamResult
        console.log(`[OpenCodeSessionManager] Extracted stream, type:`, typeof stream, 'isAsyncIterable:', stream && typeof stream[Symbol.asyncIterator] === 'function')

        if (!stream || typeof stream[Symbol.asyncIterator] !== 'function') {
          const errorMessage = 'Stream is not async iterable'
          console.error(
            `[OpenCodeSessionManager] ${errorMessage} for session ${sessionID}. Stream:`,
            stream
          )
          callback({
            type: 'error',
            sessionId: sessionID,
            error: errorMessage,
          })
          return
        }

        console.log(`[OpenCodeSessionManager] SSE stream created for session ${sessionID}, starting to listen for events`)

        for await (const event of stream as AsyncIterable<Event>) {
          if (signal.aborted) break
          let sessionEvent: SessionEvent

          if (isMessageEvent(event)) {
            if (!this.shouldHandleSessionEvent(sessionID, event)) {
              console.log(
                `[OpenCodeSessionManager] Event filtered out for session ${sessionID}:`,
                event.type
              )
              continue
            }
            switch (event.type) {
              case 'message.updated':
                if (event.properties.info?.id) {
                  this.messageSessionIndex.set(event.properties.info.id, sessionID)
                }
                sessionEvent = {
                  type: 'message.updated',
                  sessionId: sessionID,
                  message: event.properties.info,
                }
                console.log(
                  `[OpenCodeSessionManager] Sending message.updated event for session ${sessionID}, messageId: ${event.properties.info?.id}`
                )
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
                console.log(
                  `[OpenCodeSessionManager] Sending message.removed event for session ${sessionID}, messageId: ${event.properties.messageID}`
                )
                break
              case 'message.part.updated':
                sessionEvent = {
                  type: 'message.part.updated',
                  sessionId: sessionID,
                  messageId: event.properties.part.messageID,
                  part: event.properties.part,
                  delta: event.properties.delta,
                }
                console.log(
                  `[OpenCodeSessionManager] Sending message.part.updated event for session ${sessionID}, messageId: ${event.properties.part.messageID}, partId: ${event.properties.part.id}`
                )
                break
              case 'message.part.removed':
                sessionEvent = {
                  type: 'message.part.removed',
                  sessionId: sessionID,
                  messageId: event.properties.messageID,
                  partId: event.properties.partID,
                }
                console.log(
                  `[OpenCodeSessionManager] Sending message.part.removed event for session ${sessionID}, messageId: ${event.properties.messageID}, partId: ${event.properties.partID}`
                )
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
        if (abortController.signal.aborted) {
          return
        }
        const message = error instanceof Error ? error.message : String(error)
        console.warn(`[OpenCodeSessionManager] Event stream error for session ${sessionID}:`, error)
        callback({
          type: 'error',
          sessionId: sessionID,
          error: message,
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

  private async loadPartsForMessage(messageID: string): Promise<Part[]> {
    try {
      const partsDir = path.join(this.getOpenCodeStoragePath(), 'part', messageID)
      const partFiles = await fs.readdir(partsDir)
      const partsFiltered = partFiles.filter((f) => f.startsWith('prt_') && f.endsWith('.json'))

      const parts = await Promise.all(
        partsFiltered.map(async (filename) => {
          const filePath = path.join(partsDir, filename)
          try {
            const partData = JSON.parse(await fs.readFile(filePath, 'utf-8'))
            return partData as Part
          } catch (e) {
            console.error(`[OpenCodeSessionManager] Failed to read part file ${filePath}:`, e)
            return null
          }
        })
      )
      return parts.filter((p): p is NonNullable<typeof p> => p !== null)
    } catch (error) {
      return []
    }
  }

  private async getMessagesFromFilesystem(
    sessionId: string,
    limit?: number
  ): Promise<
    Array<{
      id: string
      role: 'user' | 'assistant'
      content: string
      parts: Part[]
      timestamp: number
    }>
  > {
    try {
      const storagePath = this.getOpenCodeStoragePath()
      const messageDir = path.join(storagePath, 'message', sessionId)

      const messageFiles = await fs.readdir(messageDir)
      const messageFilesFiltered = messageFiles.filter(
        (f) => f.startsWith('msg_') && f.endsWith('.json')
      )

      if (messageFilesFiltered.length === 0) {
        return []
      }

      const messages = await Promise.all(
        messageFilesFiltered.map(async (filename) => {
          const filePath = path.join(messageDir, filename)
          try {
            const messageData = JSON.parse(await fs.readFile(filePath, 'utf-8'))
            const time = messageData.time || { created: Date.now() }
            const role = messageData.role === 'user' ? ('user' as const) : ('assistant' as const)
            const parts = await this.loadPartsForMessage(messageData.id)

            const content =
              typeof messageData.content === 'string' && messageData.content
                ? messageData.content
                : parts.length > 0
                  ? this.buildMessageContent(parts)
                  : messageData.summary?.title || ''
            return {
              id: messageData.id,
              role,
              content,
              parts,
              timestamp: typeof time.created === 'number' ? time.created : Number(time.created),
            }
          } catch (e) {
            console.error(`[OpenCodeSessionManager] Failed to read message file ${filePath}:`, e)
            return null
          }
        })
      )

      const filtered = messages.filter((m): m is NonNullable<typeof m> => m !== null)
      return limit ? filtered.slice(0, limit) : filtered
    } catch (error) {
      console.error(
        `[OpenCodeSessionManager] Failed to load messages for session ${sessionId} from filesystem:`,
        error
      )
      return []
    }
  }

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
   * Получить все сообщения из сессии
   */
  private getOpenCodeStoragePath(): string {
    const userDataPath = path.join(os.homedir(), '.local', 'share')
    return path.join(userDataPath, 'opencode', 'storage')
  }

  private async resolveSessionDirectory(sessionID: string): Promise<string | null> {
    const active = this.activeSessions.get(sessionID)
    if (active?.directory) {
      console.log(
        `[OpenCodeSessionManager] resolveSessionDirectory: found in activeSessions for ${sessionID}: ${active.directory}`
      )
      return active.directory
    }

    console.log(
      `[OpenCodeSessionManager] resolveSessionDirectory: session ${sessionID} not in activeSessions, checking storage`
    )
    const directory = await this.getSessionDirectoryFromStorage(sessionID)
    if (directory) {
      console.log(
        `[OpenCodeSessionManager] resolveSessionDirectory: found in storage for ${sessionID}: ${directory}`
      )
    } else {
      console.warn(
        `[OpenCodeSessionManager] resolveSessionDirectory: NOT FOUND for ${sessionID}`
      )
    }
    return directory
  }

  private async getSessionDirectoryFromStorage(sessionID: string): Promise<string | null> {
    const storagePath = this.getOpenCodeStoragePath()
    const sessionFilePath = path.join(storagePath, 'session', `${sessionID}.json`)

    try {
      const raw = await fs.readFile(sessionFilePath, 'utf-8')
      const data = JSON.parse(raw) as Record<string, unknown>
      const directory = data.directory
      const dir = data.dir
      if (typeof directory === 'string' && directory) {
        return directory
      }
      if (typeof dir === 'string' && dir) {
        return dir
      }
      return null
    } catch {
      return null
    }
  }

  private shouldHandleSessionEvent(sessionID: string, event: Event): boolean {
    switch (event.type) {
      case 'message.updated':
        return true
      case 'message.removed':
        return true
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

  private buildMessageContent(parts: Part[], withReasoning = true): string {
    const textParts: string[] = []
    const reasoningParts: string[] = []
    const toolParts: string[] = []

    for (const part of parts) {
      if (part.type === 'text') {
        if (!part.ignored) {
          textParts.push(part.text)
        }
        continue
      }
      if (part.type === 'reasoning' && part.text) {
        reasoningParts.push(part.text)
        continue
      }
      if (part.type === 'tool' && 'state' in part) {
        const state = (part as any).state
        if (state?.output && typeof state.output === 'string') {
          toolParts.push(state.output)
        }
      }
    }

    const text = textParts.join('\n').trim()
    const reasoning = reasoningParts.join('\n').trim()
    const tools = toolParts.join('\n\n---\n\n').trim()

    if (!text && !reasoning && !tools && parts.length > 0) {
      const first = parts[0]
      const messageId = first.messageID
      const sessionId = first.sessionID
      const partTypes = parts.map((part) => part.type).join(', ')
      console.log(
        `[OpenCodeSessionManager] Empty content for message ${messageId} in session ${sessionId}. Parts: ${partTypes}`
      )
    }

    const hasReasoning = withReasoning && reasoning
    const hasTools = tools.length > 0

    if (!hasReasoning && !hasTools) {
      return text
    }

    const sections: string[] = []
    if (text) sections.push(text)
    if (hasReasoning) sections.push(`[thoughts]\n${reasoning}`)
    if (hasTools) sections.push(`[tools]\n${tools}`)

    return sections.join('\n\n')
  }
}

export const sessionManager = new OpenCodeSessionManager()
