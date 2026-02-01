import { EventEmitter } from 'events'
import type { STTLanguage } from '../../shared/types/ipc'

import WebSocket from 'ws'

export interface TranscriptionClientEvents {
  status: (
    status: 'idle' | 'listening' | 'speech' | 'finalizing' | 'error',
    details?: string
  ) => void
  delta: (itemId: string, textDelta: string) => void
  final: (itemId: string, transcript: string) => void
  error: (error: { code?: string; message: string }) => void
}

interface OpenAIClientEvent {
  type: string
}

interface SessionUpdatedEvent extends OpenAIClientEvent {
  type: 'session.updated'
}

interface InputAudioBufferSpeechStartedEvent extends OpenAIClientEvent {
  type: 'input_audio_buffer.speech_started'
}

interface InputAudioBufferSpeechStoppedEvent extends OpenAIClientEvent {
  type: 'input_audio_buffer.speech_stopped'
}

interface InputAudioBufferCommittedEvent extends OpenAIClientEvent {
  type: 'input_audio_buffer.committed'
  item_id: string
  previous_item_id?: string
}

interface ConversationItemInputAudioTranscriptionDeltaEvent extends OpenAIClientEvent {
  type: 'conversation.item.input_audio_transcription.delta'
  item_id: string
  delta: string
}

interface ConversationItemInputAudioTranscriptionCompletedEvent extends OpenAIClientEvent {
  type: 'conversation.item.input_audio_transcription.completed'
  item_id: string
  transcript: string
}

interface ConversationItemInputAudioTranscriptionFailedEvent extends OpenAIClientEvent {
  type: 'conversation.item.input_audio_transcription.failed'
  item_id: string
  error: {
    code?: string
    message: string
  }
}

interface ErrorEvent extends OpenAIClientEvent {
  type: 'error'
  error: {
    code?: string
    message: string
  }
}

type ServerEvent =
  | SessionUpdatedEvent
  | InputAudioBufferSpeechStartedEvent
  | InputAudioBufferSpeechStoppedEvent
  | InputAudioBufferCommittedEvent
  | ConversationItemInputAudioTranscriptionDeltaEvent
  | ConversationItemInputAudioTranscriptionCompletedEvent
  | ConversationItemInputAudioTranscriptionFailedEvent
  | ErrorEvent

export interface RealtimeTranscriptionClientConfig {
  apiKey: string
  model?: string
  language?: STTLanguage
  vadThreshold?: number
  vadPrefixPaddingMs?: number
  vadSilenceDurationMs?: number
}

export class RealtimeTranscriptionClient extends EventEmitter {
  private ws: WebSocket | null = null
  private config: Required<RealtimeTranscriptionClientConfig>
  private reconnectAttempts = 0
  private maxReconnectAttempts = 5
  private reconnectBackoffMs = [250, 1000, 2000, 5000]
  private reconnectTimer: NodeJS.Timeout | null = null
  private isConnecting = false
  private isShuttingDown = false

  constructor(config: RealtimeTranscriptionClientConfig) {
    super()
    this.config = {
      apiKey: config.apiKey,
      model: config.model ?? 'gpt-4o-transcribe',
      language: config.language ?? 'ru',
      vadThreshold: config.vadThreshold ?? 0.5,
      vadPrefixPaddingMs: config.vadPrefixPaddingMs ?? 300,
      vadSilenceDurationMs: config.vadSilenceDurationMs ?? 600,
    }
  }

  async connect(): Promise<void> {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.emit('status', 'listening')
      return
    }

    if (this.isConnecting) {
      return
    }

    this.isConnecting = true
    this.isShuttingDown = false

    const url = `wss://api.openai.com/v1/realtime?model=${this.config.model}`

    return new Promise((resolve, reject) => {
      const ws = new WebSocket(url, {
        headers: {
          Authorization: `Bearer ${this.config.apiKey}`,
        },
      })

      this.ws = ws

      ws.on('open', () => {
        console.log('[RealtimeTranscriptionClient] WebSocket connected')
        this.isConnecting = false
        this.reconnectAttempts = 0
        this.sendSessionUpdate()
        this.emit('status', 'listening')
        resolve()
      })

      ws.on('message', (data: WebSocket.Data) => {
        this.handleMessage(data as Buffer)
      })

      ws.on('error', (wsError: Error) => {
        console.error('[RealtimeTranscriptionClient] WebSocket error:', wsError)
        this.isConnecting = false
        this.emit('error', { code: 'WEBSOCKET_ERROR', message: wsError.message })
        reject(wsError)
      })

      ws.on('close', (code: number, reason: Buffer) => {
        console.log(
          `[RealtimeTranscriptionClient] WebSocket closed: code=${code} reason=${reason.toString()}`
        )
        this.isConnecting = false

        if (!this.isShuttingDown && this.reconnectAttempts < this.maxReconnectAttempts) {
          this.scheduleReconnect()
        } else if (!this.isShuttingDown) {
          this.emit(
            'status',
            'error',
            `Connection closed after ${this.reconnectAttempts} reconnect attempts`
          )
        }
      })
    })
  }

  private sendSessionUpdate(): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return
    }

    const sessionUpdate = {
      type: 'session.update',
      session: {
        type: 'transcription',
        audio: {
          input: {
            format: {
              type: 'audio/pcm',
              rate: 24000,
            },
            noise_reduction: {
              type: 'near_field',
            },
            transcription: {
              model: this.config.model,
              language: this.config.language,
              prompt:
                'Expect product and engineering terms: Kanban, user story, acceptance criteria, PR, merge, OpenCode.',
            },
            turn_detection: {
              type: 'server_vad',
              threshold: this.config.vadThreshold,
              prefix_padding_ms: this.config.vadPrefixPaddingMs,
              silence_duration_ms: this.config.vadSilenceDurationMs,
            },
          },
        },
      },
    }

    this.ws.send(JSON.stringify(sessionUpdate))
    console.log('[RealtimeTranscriptionClient] Sent session.update')
  }

  private handleMessage(data: Buffer): void {
    try {
      const event = JSON.parse(data.toString()) as ServerEvent

      switch (event.type) {
        case 'session.updated':
          console.log('[RealtimeTranscriptionClient] Session updated')
          this.emit('status', 'listening')
          break

        case 'input_audio_buffer.speech_started':
          console.log('[RealtimeTranscriptionClient] Speech started')
          this.emit('status', 'speech')
          break

        case 'input_audio_buffer.speech_stopped':
          console.log('[RealtimeTranscriptionClient] Speech stopped')
          this.emit('status', 'finalizing')
          break

        case 'input_audio_buffer.committed':
          console.log('[RealtimeTranscriptionClient] Audio buffer committed:', event.item_id)
          break

        case 'conversation.item.input_audio_transcription.delta':
          console.log('[RealtimeTranscriptionClient] Delta:', event.item_id, event.delta)
          this.emit('delta', event.item_id, event.delta)
          break

        case 'conversation.item.input_audio_transcription.completed':
          console.log('[RealtimeTranscriptionClient] Completed:', event.item_id, event.transcript)
          this.emit('final', event.item_id, event.transcript)
          this.emit('status', 'listening')
          break

        case 'conversation.item.input_audio_transcription.failed':
          console.error(
            '[RealtimeTranscriptionClient] Transcription failed:',
            event.item_id,
            event.error
          )
          this.emit('error', event.error)
          break

        case 'error':
          console.error('[RealtimeTranscriptionClient] Server error:', event.error)
          this.emit('error', event.error)
          break

        default:
          const unhandledEvent = event as OpenAIClientEvent
          console.log('[RealtimeTranscriptionClient] Unhandled event type:', unhandledEvent.type)
      }
    } catch (parseError) {
      console.error('[RealtimeTranscriptionClient] Failed to parse message:', parseError)
    }
  }

  appendAudio(base64: string): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.warn('[RealtimeTranscriptionClient] Cannot append audio: WebSocket not connected')
      return
    }

    const appendEvent = {
      type: 'input_audio_buffer.append',
      audio: base64,
    }

    this.ws.send(JSON.stringify(appendEvent))
  }

  updateLanguage(language: STTLanguage): void {
    this.config.language = language
    this.sendSessionUpdate()
    console.log('[RealtimeTranscriptionClient] Language updated to:', language)
  }

  stop(): void {
    this.isShuttingDown = true

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }

    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'input_audio_buffer.commit' }))
      this.ws.send(JSON.stringify({ type: 'input_audio_buffer.clear' }))
      this.ws.close()
    }

    this.ws = null
    this.reconnectAttempts = 0

    console.log('[RealtimeTranscriptionClient] Stopped')
  }

  private scheduleReconnect(): void {
    const backoffMs =
      this.reconnectBackoffMs[Math.min(this.reconnectAttempts, this.reconnectBackoffMs.length - 1)]

    console.log(
      `[RealtimeTranscriptionClient] Scheduling reconnect in ${backoffMs}ms (attempt ${this.reconnectAttempts + 1}/${this.maxReconnectAttempts})`
    )

    this.reconnectTimer = setTimeout(async () => {
      this.reconnectAttempts++

      try {
        await this.connect()
        console.log('[RealtimeTranscriptionClient] Reconnect successful')
      } catch (reconnectError) {
        console.error('[RealtimeTranscriptionClient] Reconnect failed:', reconnectError)

        if (this.reconnectAttempts < this.maxReconnectAttempts) {
          this.scheduleReconnect()
        }
      }
    }, backoffMs)
  }

  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN
  }
}
