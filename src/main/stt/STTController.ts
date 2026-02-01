import type { IpcMainInvokeEvent, WebContents } from 'electron'
import { app } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import { VoskTranscriptionClient } from './VoskTranscriptionClient'
import type {
  STTDeltaEvent,
  STTErrorEvent,
  STTFinalEvent,
  STTLanguage,
  STTStatusEvent,
} from '../../shared/types/ipc'

type STTState =
  | 'idle'
  | 'connecting'
  | 'listening'
  | 'speech'
  | 'transcribing'
  | 'finalizing'
  | 'error'

const FINALIZE_TIMEOUT_MS = 5000
const VOSK_SAMPLE_RATE = 16000
const VOSK_MODELS: Record<STTLanguage, string> = {
  en: 'vosk-model-small-en-us-0.15',
  ru: 'vosk-model-small-ru-0.22',
}

interface ActiveSession {
  client: VoskTranscriptionClient
  editorId: string
  webContents: WebContents
  language: STTLanguage
  state: STTState
  stopRequested: boolean
  finalizeTimer: NodeJS.Timeout | null
  currentItemId: string | null
}

export class STTController {
  private activeSessions = new Map<string, ActiveSession>()

  async startSession(
    event: IpcMainInvokeEvent,
    editorId: string,
    language: STTLanguage
  ): Promise<void> {
    const existingSession = this.activeSessions.get(editorId)
    if (existingSession) {
      console.log(`[STTController] Session already exists for editor ${editorId}, stopping it`)
      await this.stopSession(editorId)
    }

    const modelPath = this.resolveModelPath(language)
    if (!modelPath) {
      this.sendError(event.sender, editorId, {
        code: 'MODEL_NOT_FOUND',
        message: `Vosk model not found for language ${language}`,
      })
      throw new Error(`Vosk model not found for language ${language}`)
    }

    const scriptPath = this.getVoskScriptPath()
    if (!fs.existsSync(scriptPath)) {
      this.sendError(event.sender, editorId, {
        code: 'VOSK_SCRIPT_MISSING',
        message: `Vosk script not found at ${scriptPath}`,
      })
      throw new Error(`Vosk script not found at ${scriptPath}`)
    }

    const client = new VoskTranscriptionClient({
      scriptPath,
      modelPath,
      sampleRate: VOSK_SAMPLE_RATE,
    })

    const session: ActiveSession = {
      client,
      editorId,
      webContents: event.sender,
      language,
      state: 'connecting',
      stopRequested: false,
      finalizeTimer: null,
      currentItemId: null,
    }

    this.activeSessions.set(editorId, session)

    this.setupClientEventListeners(session)

    try {
      this.sendStatus(event.sender, editorId, 'connecting')
      client.connect()
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
      return
    }

    console.log(`[STTController] Stopping session for editor ${editorId}`)
    session.stopRequested = true
    this.enterFinalizing(session, 'stop_requested')
  }

  updateLanguage(editorId: string, language: STTLanguage): void {
    const session = this.activeSessions.get(editorId)
    if (!session) {
      return
    }

    console.log(`[STTController] Updating language for editor ${editorId} to ${language}`)
    const modelPath = this.resolveModelPath(language)
    if (!modelPath) {
      this.sendError(session.webContents, editorId, {
        code: 'MODEL_NOT_FOUND',
        message: `Vosk model not found for language ${language}`,
      })
      return
    }

    session.language = language
    session.state = 'connecting'
    this.sendStatus(session.webContents, editorId, 'connecting')
    session.client.updateModelPath(modelPath)
  }

  appendAudio(editorId: string, pcm16Base64: string): void {
    const session = this.activeSessions.get(editorId)
    if (!session) {
      return
    }

    if (session.state === 'finalizing' || session.state === 'error') {
      return
    }

    const audioChunk = Buffer.from(pcm16Base64, 'base64')
    if (session.state !== 'speech') {
      session.state = 'speech'
      this.sendStatus(session.webContents, session.editorId, 'speech')
    }

    session.client.sendAudioChunk(audioChunk)
  }

  getActiveEditorIds(): string[] {
    return Array.from(this.activeSessions.keys())
  }

  isSessionActive(editorId: string): boolean {
    return this.activeSessions.has(editorId)
  }

  private resolveModelPath(language: STTLanguage): string | null {
    const modelName = VOSK_MODELS[language]
    const configuredPath = process.env.STT_VOSK_MODEL_PATH

    if (configuredPath) {
      const explicitModelPath = path.resolve(configuredPath)
      const candidateFromRoot = path.join(explicitModelPath, modelName)

      if (fs.existsSync(explicitModelPath)) {
        if (path.basename(explicitModelPath) === modelName) {
          return explicitModelPath
        }

        if (fs.existsSync(candidateFromRoot)) {
          return candidateFromRoot
        }
      }
    }

    const candidatePaths = [
      path.join(app.getPath('userData'), 'vosk', modelName),
      path.join(app.getAppPath(), 'assets', 'vosk', modelName),
    ]

    for (const candidate of candidatePaths) {
      if (fs.existsSync(candidate)) {
        return candidate
      }
    }

    return null
  }

  private getVoskScriptPath(): string {
    return path.join(app.getAppPath(), 'scripts', 'vosk-stt.py')
  }

  private setupClientEventListeners(session: ActiveSession): void {
    const { client, editorId, webContents } = session

    client.on('ready', () => {
      if (session.state === 'error' || session.state === 'finalizing') {
        return
      }

      session.state = 'listening'
      this.sendStatus(webContents, editorId, 'listening')
    })

    client.on('partial', (partialText) => {
      if (session.state === 'error' || session.state === 'finalizing') {
        return
      }

      if (!session.currentItemId) {
        session.currentItemId = this.generateItemId()
      }

      this.sendDelta(webContents, editorId, session.currentItemId, partialText)
    })

    client.on('final', (transcript) => {
      if (session.state === 'error') {
        return
      }

      if (session.state === 'finalizing' && !session.stopRequested) {
        return
      }

      const itemId = session.currentItemId ?? this.generateItemId()
      session.currentItemId = null

      if (transcript.trim().length > 0) {
        this.sendFinal(webContents, editorId, itemId, transcript)
      }

      if (session.stopRequested && session.state !== 'finalizing') {
        this.enterFinalizing(session, 'stop_requested')
      }
    })

    client.on('error', (error) => {
      console.error(`[STTController] Transcription error for editor ${editorId}:`, error)
      this.sendError(webContents, editorId, error)
      session.state = 'error'
      this.cleanupSession(editorId)
    })

    client.on('exit', (code, signal) => {
      if (session.state === 'finalizing' || session.stopRequested) {
        this.finishFinalizing(session)
        return
      }

      console.error(
        `[STTController] Vosk process exited unexpectedly for editor ${editorId}: ${code} ${signal}`
      )
      session.state = 'error'
      this.sendStatus(webContents, editorId, 'error', 'Vosk process exited')
      this.cleanupSession(editorId)
    })
  }

  private enterFinalizing(session: ActiveSession, reason: string): void {
    if (session.state === 'finalizing') {
      return
    }

    session.state = 'finalizing'
    console.log(
      `[STTController] Entering finalizing state for editor ${session.editorId}, reason: ${reason}`
    )
    this.sendStatus(session.webContents, session.editorId, 'finalizing')

    if (session.finalizeTimer) {
      clearTimeout(session.finalizeTimer)
    }

    session.finalizeTimer = setTimeout(() => {
      this.finishFinalizing(session)
    }, FINALIZE_TIMEOUT_MS)

    session.client.stop()
  }

  private finishFinalizing(session: ActiveSession): void {
    if (session.state !== 'finalizing' && session.state !== 'error') {
      return
    }

    console.log(`[STTController] Finalizing session for editor ${session.editorId}`)

    if (session.finalizeTimer) {
      clearTimeout(session.finalizeTimer)
      session.finalizeTimer = null
    }

    session.client.close()
    this.cleanupSession(session.editorId)
  }

  private cleanupSession(editorId: string): void {
    const session = this.activeSessions.get(editorId)
    if (!session) {
      return
    }

    if (session.finalizeTimer) {
      clearTimeout(session.finalizeTimer)
    }

    session.client.close()

    this.sendStatus(session.webContents, session.editorId, 'idle')

    this.activeSessions.delete(editorId)
    console.log(`[STTController] Session cleaned up for editor ${editorId}`)
  }

  private sendStatus(
    webContents: WebContents,
    editorId: string,
    status: STTStatusEvent['status'],
    details?: string
  ): void {
    const event: STTStatusEvent = {
      editorId,
      status,
      details,
    }
    webContents.send('stt:status', event)
  }

  private generateItemId(): string {
    return `stt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }

  private sendDelta(
    webContents: WebContents,
    editorId: string,
    itemId: string,
    delta: string
  ): void {
    const event: STTDeltaEvent = {
      editorId,
      itemId,
      textDelta: delta,
    }
    webContents.send('stt:delta', event)
  }

  private sendFinal(
    webContents: WebContents,
    editorId: string,
    itemId: string,
    transcript: string
  ): void {
    const event: STTFinalEvent = {
      editorId,
      itemId,
      transcript,
    }
    webContents.send('stt:final', event)
  }

  private sendError(
    webContents: WebContents,
    editorId: string,
    error: { code?: string; message: string }
  ): void {
    const event: STTErrorEvent = {
      editorId,
      error: {
        code: error.code || 'UNKNOWN',
        message: error.message,
      },
    }
    webContents.send('stt:error', event)
  }
}
