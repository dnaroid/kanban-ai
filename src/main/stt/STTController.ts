import type { IpcMainInvokeEvent, WebContents } from 'electron'
import { RealtimeTranscriptionClient } from './RealtimeTranscriptionClient'
import type {
  STTDeltaEvent,
  STTErrorEvent,
  STTFinalEvent,
  STTLanguage,
  STTStatusEvent,
} from '../../shared/types/ipc'

interface ActiveSession {
  client: RealtimeTranscriptionClient
  editorId: string
  webContents: WebContents
  language: STTLanguage
  itemIdToEditorId: Map<string, string>
}

export class STTController {
  private activeSessions = new Map<string, ActiveSession>()
  private itemIdToEditorId = new Map<string, string>()

  async startSession(
    event: IpcMainInvokeEvent,
    editorId: string,
    language: STTLanguage
  ): Promise<void> {
    const apiKey = process.env.OPENAI_API_KEY
    if (!apiKey) {
      this.sendError(event.sender, editorId, {
        code: 'NO_API_KEY',
        message: 'OPENAI_API_KEY environment variable is not set',
      })
      throw new Error('OPENAI_API_KEY not configured')
    }

    const existingSession = this.activeSessions.get(editorId)
    if (existingSession) {
      console.log(`[STTController] Session already exists for editor ${editorId}, stopping it`)
      await this.stopSession(editorId)
    }

    const client = new RealtimeTranscriptionClient({
      apiKey,
      language,
      model: 'gpt-4o-transcribe',
    })

    const session: ActiveSession = {
      client,
      editorId,
      webContents: event.sender,
      language,
      itemIdToEditorId: new Map<string, string>(),
    }

    this.activeSessions.set(editorId, session)

    this.setupClientEventListeners(session)

    try {
      await client.connect()
      this.sendStatus(event.sender, editorId, 'listening')
    } catch (error) {
      console.error(`[STTController] Failed to connect client for editor ${editorId}:`, error)
      this.sendError(event.sender, editorId, {
        code: 'CONNECTION_FAILED',
        message: error instanceof Error ? error.message : 'Unknown error',
      })
      this.cleanupSession(editorId)
      throw error
    }
  }

  async stopSession(editorId: string): Promise<void> {
    const session = this.activeSessions.get(editorId)
    if (!session) {
      console.warn(`[STTController] No active session for editor ${editorId}`)
      return
    }

    console.log(`[STTController] Stopping session for editor ${editorId}`)
    session.client.stop()
    this.cleanupSession(editorId)
  }

  updateLanguage(editorId: string, language: STTLanguage): void {
    const session = this.activeSessions.get(editorId)
    if (!session) {
      console.warn(`[STTController] No active session for editor ${editorId}`)
      return
    }

    console.log(`[STTController] Updating language for editor ${editorId} to ${language}`)
    session.language = language
    session.client.updateLanguage(language)
  }

  appendAudio(editorId: string, pcm16Base64: string): void {
    const session = this.activeSessions.get(editorId)
    if (!session) {
      console.warn(`[STTController] No active session for editor ${editorId}`)
      return
    }

    session.client.appendAudio(pcm16Base64)
  }

  getActiveEditorIds(): string[] {
    return Array.from(this.activeSessions.keys())
  }

  isSessionActive(editorId: string): boolean {
    return this.activeSessions.has(editorId)
  }

  private setupClientEventListeners(session: ActiveSession): void {
    const { client, editorId, webContents } = session

    client.on('status', (status, details) => {
      this.sendStatus(webContents, editorId, status, details)
    })

    client.on('delta', (itemId, textDelta) => {
      session.itemIdToEditorId.set(itemId, editorId)
      this.itemIdToEditorId.set(itemId, editorId)
      this.sendDelta(webContents, editorId, itemId, textDelta)
    })

    client.on('final', (itemId, transcript) => {
      session.itemIdToEditorId.delete(itemId)
      this.itemIdToEditorId.delete(itemId)
      this.sendFinal(webContents, editorId, itemId, transcript)
    })

    client.on('error', (error) => {
      this.sendError(webContents, editorId, error)
    })
  }

  private cleanupSession(editorId: string): void {
    const session = this.activeSessions.get(editorId)
    if (!session) {
      return
    }

    for (const [itemId] of session.itemIdToEditorId.entries()) {
      this.itemIdToEditorId.delete(itemId)
    }

    session.itemIdToEditorId.clear()
    this.activeSessions.delete(editorId)

    console.log(`[STTController] Cleaned up session for editor ${editorId}`)
  }

  private sendStatus(
    webContents: WebContents,
    editorId: string,
    status: STTStatusEvent['status'],
    details?: string
  ): void {
    const statusEvent: STTStatusEvent = {
      editorId,
      status,
      details,
    }
    webContents.send('stt:status', statusEvent)
  }

  private sendDelta(
    webContents: WebContents,
    editorId: string,
    itemId: string,
    textDelta: string
  ): void {
    const deltaEvent: STTDeltaEvent = {
      editorId,
      itemId,
      textDelta,
    }
    webContents.send('stt:delta', deltaEvent)
  }

  private sendFinal(
    webContents: WebContents,
    editorId: string,
    itemId: string,
    transcript: string
  ): void {
    const finalEvent: STTFinalEvent = {
      editorId,
      itemId,
      transcript,
    }
    webContents.send('stt:final', finalEvent)
  }

  private sendError(
    webContents: WebContents,
    editorId: string,
    error: STTErrorEvent['error']
  ): void {
    const errorEvent: STTErrorEvent = {
      editorId,
      error,
    }
    webContents.send('stt:error', errorEvent)
  }
}

export const sttController = new STTController()
