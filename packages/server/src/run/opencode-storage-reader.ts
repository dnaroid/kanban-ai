import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import type { Part } from '@opencode-ai/sdk/v2/client'

type StoredMessage = {
  id: string
  role: 'user' | 'assistant'
  content: string
  parts: Part[]
  timestamp: number
}

export class OpenCodeStorageReader {
  constructor(private readonly buildMessageContent: (parts: Part[]) => string) {}

  getOpenCodeStoragePath(): string {
    if (process.platform === 'darwin') {
      return path.join(os.homedir(), 'Library', 'Application Support', 'opencode', 'storage')
    }
    if (process.platform === 'win32') {
      const base = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming')
      return path.join(base, 'opencode', 'storage')
    }
    const userDataPath = path.join(os.homedir(), '.local', 'share')
    return path.join(userDataPath, 'opencode', 'storage')
  }

  async getMessagesFromFilesystem(sessionId: string, limit?: number): Promise<StoredMessage[]> {
    try {
      const storagePath = this.getOpenCodeStoragePath()
      const messageDir = path.join(storagePath, 'message', sessionId)

      const messageFiles = await fs.readdir(messageDir)
      const messageFilesFiltered = messageFiles
        .filter((f) => f.startsWith('msg_') && f.endsWith('.json'))
        .sort((a, b) => a.localeCompare(b))

      if (messageFilesFiltered.length === 0) {
        return []
      }

      const readTargets =
        typeof limit === 'number' && limit > 0
          ? messageFilesFiltered.slice(-limit)
          : messageFilesFiltered

      const messages = await Promise.all(
        readTargets.map(async (filename) => {
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
          } catch (error) {
            console.error(`[OpenCodeStorageReader] Failed to read message file ${filePath}:`, error)
            return null
          }
        })
      )

      const filtered = messages.filter(
        (message): message is NonNullable<typeof message> => message !== null
      )
      return filtered.sort((a, b) => a.timestamp - b.timestamp)
    } catch (error) {
      console.error(
        `[OpenCodeStorageReader] Failed to load messages for session ${sessionId} from filesystem:`,
        error
      )
      return []
    }
  }

  private async loadPartsForMessage(messageID: string): Promise<Part[]> {
    try {
      const partsDir = path.join(this.getOpenCodeStoragePath(), 'part', messageID)
      const partFiles = await fs.readdir(partsDir)
      const partsFiltered = partFiles
        .filter((fileName) => fileName.startsWith('prt_') && fileName.endsWith('.json'))
        .sort((a, b) => a.localeCompare(b))

      const parts = await Promise.all(
        partsFiltered.map(async (filename) => {
          const filePath = path.join(partsDir, filename)
          try {
            const partData = JSON.parse(await fs.readFile(filePath, 'utf-8'))
            return partData as Part
          } catch (error) {
            console.error(`[OpenCodeStorageReader] Failed to read part file ${filePath}:`, error)
            return null
          }
        })
      )
      return parts.filter((part: Part | null): part is Part => part !== null)
    } catch {
      return []
    }
  }
}
