import { EventEmitter } from 'events'
import { spawn, type ChildProcessWithoutNullStreams } from 'child_process'
import readline from 'readline'

export interface VoskTranscriptionClientEvents {
  partial: (text: string) => void
  final: (text: string) => void
  ready: () => void
  exit: (code: number | null, signal: NodeJS.Signals | null) => void
  error: (error: { code?: string; message: string }) => void
}

export interface VoskTranscriptionClientConfig {
  scriptPath: string
  modelPath: string
  sampleRate?: number
  pythonCommand?: string
}

const DEFAULT_SAMPLE_RATE = 16000
const DEFAULT_PYTHON_COMMAND = 'python3'
const STOP_KILL_TIMEOUT_MS = 8000

export class VoskTranscriptionClient extends EventEmitter {
  private process: ChildProcessWithoutNullStreams | null = null
  private config: Required<VoskTranscriptionClientConfig>
  private killTimer: NodeJS.Timeout | null = null
  private stopping = false

  constructor(config: VoskTranscriptionClientConfig) {
    super()
    this.config = {
      scriptPath: config.scriptPath,
      modelPath: config.modelPath,
      sampleRate: config.sampleRate ?? DEFAULT_SAMPLE_RATE,
      pythonCommand: config.pythonCommand ?? DEFAULT_PYTHON_COMMAND,
    }
  }

  connect(): void {
    this.stop()

    const args = [
      this.config.scriptPath,
      '--model',
      this.config.modelPath,
      '--rate',
      String(this.config.sampleRate),
    ]

    this.stopping = false
    this.process = spawn(this.config.pythonCommand, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
    })

    const rl = readline.createInterface({ input: this.process.stdout })
    rl.on('line', (line) => {
      try {
        const msg = JSON.parse(line)
        if (msg.type === 'partial') {
          const text = msg.data?.partial ?? ''
          this.emit('partial', text)
        } else if (msg.type === 'final') {
          const text = msg.data?.text ?? ''
          this.emit('final', text)
        }
      } catch (error) {
        console.warn('[VoskTranscriptionClient] Failed to parse message:', error)
      }
    })

    this.process.stderr.on('data', (data) => {
      const text = data.toString().trim()
      if (text.length > 0) {
        console.log('[VoskTranscriptionClient]', text)
      }
    })

    this.process.stdin.on('error', (error) => {
      if (this.stopping) {
        return
      }
      this.emit('error', { code: 'stdin_error', message: error.message })
    })

    this.process.on('error', (error) => {
      this.emit('error', { code: 'process_error', message: error.message })
    })

    this.process.on('close', (code, signal) => {
      rl.close()
      this.clearKillTimer()
      this.process = null
      this.stopping = false
      this.emit('exit', code, signal)
    })

    this.emit('ready')
  }

  sendAudioChunk(buffer: Buffer): void {
    if (!this.process || this.stopping) {
      return
    }

    if (!this.process.stdin.writable) {
      return
    }

    try {
      this.process.stdin.write(buffer)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown write error'
      this.emit('error', { code: 'stdin_write_failed', message })
    }
  }

  updateModelPath(modelPath: string): void {
    if (this.config.modelPath === modelPath) {
      return
    }

    this.config.modelPath = modelPath
    this.connect()
  }

  stop(): void {
    if (!this.process || this.stopping) {
      return
    }

    this.stopping = true
    this.process.stdin.end()

    this.killTimer = setTimeout(() => {
      if (this.process) {
        this.process.kill('SIGTERM')
      }
    }, STOP_KILL_TIMEOUT_MS)
  }

  close(): void {
    if (!this.process) {
      return
    }

    this.process.kill('SIGTERM')
    this.clearKillTimer()
    this.process = null
    this.stopping = false
  }

  private clearKillTimer(): void {
    if (this.killTimer) {
      clearTimeout(this.killTimer)
      this.killTimer = null
    }
  }
}
