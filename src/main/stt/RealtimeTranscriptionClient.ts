import type { STTLanguage } from '../../shared/types/ipc'
import { EventEmitter } from 'events'
import { Readable } from 'stream'
import FormData from 'form-data'

export interface TranscriptionClientEvents {
  delta: (textDelta: string) => void
  completed: (transcript: string) => void
  error: (error: { code?: string; message: string }) => void
  wsClosed: (code: number, reason: string) => void
}

interface WhisperTranscriptionResponse {
  text: string
  task: string
  language: string
  duration: number
  words: Array<{
    word: string
    start: number
    end: number
  }>
  segment?: {
    id: number
    seek: number
    start: number
    end: number
    text: string
    tokens: number[]
    temperature: number
    avg_logprob: number
    compression_ratio: number
    no_speech_prob: number
  }
}

export interface RealtimeTranscriptionClientConfig {
  apiKey: string
  model?: string
  language?: STTLanguage
  chunkMs?: number
}

const DEFAULT_CONFIG = {
  model: 'gpt-4o-mini-transcribe',
  language: 'ru' as const,
  chunkMs: 100,
} as const

export class RealtimeTranscriptionClient extends EventEmitter {
  private config: Required<RealtimeTranscriptionClientConfig>
  private abortController: AbortController | null = null
  private isShuttingDown = false

  constructor(config: RealtimeTranscriptionClientConfig) {
    super()

    this.config = {
      apiKey: config.apiKey,
      model: config.model ?? DEFAULT_CONFIG.model,
      language: config.language ?? DEFAULT_CONFIG.language,
      chunkMs: config.chunkMs ?? DEFAULT_CONFIG.chunkMs,
    }
  }

  async connect(): Promise<void> {
    if (this.abortController) {
      this.stop()
      await new Promise((resolve) => setTimeout(resolve, 100))
    }

    this.abortController = new AbortController()
    this.isShuttingDown = false

    console.log('[RealtimeTranscriptionClient] Starting Whisper streaming transcription...')
    console.log(
      `[RealtimeTranscriptionClient] Model: ${this.config.model}, language: ${this.config.language}`
    )
  }

  async startAudioStream(audioStream: Readable): Promise<void> {
    if (!this.abortController) {
      throw new Error('Client not connected. Call connect() first.')
    }

    const chunks: Buffer[] = []
    for await (const chunk of audioStream) {
      chunks.push(chunk)
    }

    const audioBuffer = Buffer.concat(chunks)

    try {
      const formData = new FormData()
      formData.append('file', audioBuffer, 'audio.wav')
      formData.append('model', this.config.model)
      formData.append('language', this.config.language)

      const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.config.apiKey}`,
          ...formData.getHeaders(),
        },
        body: formData as any,
        signal: this.abortController.signal,
      })

      if (!response.ok) {
        const error = await response.text()
        throw new Error(`Whisper API error: ${error}`)
      }

      const data: WhisperTranscriptionResponse = await response.json()
      this.emit('completed', data.text)
      console.log('[RealtimeTranscriptionClient] Transcription completed')
    } catch (error: unknown) {
      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          console.log('[RealtimeTranscriptionClient] Transcription aborted')
          this.emit('wsClosed', 1000, 'Aborted')
        } else {
          console.error('[RealtimeTranscriptionClient] Transcription error:', error)
          this.emit('error', { code: 'whisper_error', message: error.message })
          this.emit('wsClosed', 1006, error.message)
        }
      } else {
        console.error('[RealtimeTranscriptionClient] Unknown error:', error)
        this.emit('error', {
          code: 'unknown_error',
          message: String(error),
        })
        this.emit('wsClosed', 1006, String(error))
      }
    }
  }

  async startRealtimeStream(): Promise<Readable> {
    return new Readable({
      read() {
        return ''
      },
    })
  }

  sendAudioChunk(): void {
    if (this.isShuttingDown) {
      return
    }
  }

  clear(): void {
    // Not applicable for Whisper streaming
  }

  close(): void {
    this.isShuttingDown = true

    if (this.abortController) {
      this.abortController.abort()
      this.abortController = null
    }
  }

  stop(): void {
    this.close()
    console.log('[RealtimeTranscriptionClient] Stopped')
  }

  isConnected(): boolean {
    return this.abortController !== null
  }

  updateLanguage(language: STTLanguage): void {
    this.config.language = language
    console.log('[RealtimeTranscriptionClient] Language updated to:', language)
  }
}
