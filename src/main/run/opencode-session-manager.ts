import { createOpencodeClient } from '@opencode-ai/sdk/v2/client'
import type { Session, Message, TextPartInput } from '@opencode-ai/sdk/v2/client'

export interface SessionInfo {
  id: string
  title: string
  directory: string
}

export interface SessionMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: number
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
      const textParts = item.parts
        .filter((p: any) => p.type === 'text')
        .map((p: any) => p.text)
        .join('\n')

      return {
        id: msg.id,
        role: msg.role,
        content: textParts || '',
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
      const textParts = response.data.parts
        .filter((p: any) => p.type === 'text')
        .map((p: any) => p.text)
        .join('\n')

      return {
        id: msg.id,
        role: msg.role,
        content: textParts || '',
        timestamp: msg.time.created,
      }
    } catch {
      return null
    }
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
}

export const sessionManager = new OpenCodeSessionManager()
