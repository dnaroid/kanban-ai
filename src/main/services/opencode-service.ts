import { spawn, ChildProcess } from 'node:child_process'

export interface OpencodeServiceConfig {
  port: number
  logFile?: string
}

export class OpencodeService {
  private process: ChildProcess | null = null
  private config: OpencodeServiceConfig
  private isShuttingDown = false

  constructor(config: OpencodeServiceConfig) {
    this.config = config
  }

  async isRunning(): Promise<boolean> {
    try {
      const response = await fetch(`http://127.0.0.1:${this.config.port}/health`, {
        method: 'GET',
        signal: AbortSignal.timeout(5000),
      })
      return response.ok
    } catch {
      return false
    }
  }

  async start(): Promise<void> {
    if (await this.isRunning()) {
      console.log(`[OpencodeService] OpenCode сервер уже запущен на порту ${this.config.port}`)
      return
    }

    console.log(`[OpencodeService] Запуск OpenCode сервера на порту ${this.config.port}...`)

    const args = ['serve', '--port', this.config.port.toString()]

    this.process = spawn('opencode', args, {
      detached: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    const logStream = this.config.logFile
      ? require('fs').createWriteStream(this.config.logFile)
      : process.stdout

    this.process.stdout?.on('data', (data) => {
      const output = data.toString().trim()
      if (output) {
        logStream.write(`[OpenCode] ${output}\n`)
      }
    })

    this.process.stderr?.on('data', (data) => {
      const error = data.toString().trim()
      if (error) {
        logStream.write(`[OpenCode Error] ${error}\n`)
      }
    })

    this.process.on('error', (error) => {
      logStream.write(`[OpencodeService] Ошибка запуска: ${error}\n`)
    })

    this.process.on('exit', (code) => {
      if (!this.isShuttingDown) {
        logStream.write(`[OpencodeService] Процесс завершился с кодом: ${code}\n`)
      }
      this.process = null
    })

    await new Promise((resolve) => setTimeout(resolve, 3000))

    if (!(await this.isRunning())) {
      throw new Error(`Не удалось запустить OpenCode сервер на порту ${this.config.port}`)
    }

    console.log(`[OpencodeService] OpenCode сервер успешно запущен`)
  }

  async stop(): Promise<void> {
    if (!this.process) {
      console.log('[OpencodeService] Процесс не запущен')
      return
    }

    this.isShuttingDown = true
    console.log('[OpencodeService] Остановка OpenCode сервера...')

    this.process.kill('SIGTERM')

    setTimeout(() => {
      if (this.process && !this.process.killed) {
        console.log('[OpencodeService] Принудительная остановка...')
        this.process.kill('SIGKILL')
      }
    }, 5000)

    await new Promise((resolve) => setTimeout(resolve, 6000))

    console.log('[OpencodeService] OpenCode сервер остановлен')
  }

  async shutdown(): Promise<void> {
    console.log('[OpencodeService] Graceful shutdown...')
    await this.stop()
  }
}

let serviceInstance: OpencodeService | null = null

export function createOpencodeService(config: OpencodeServiceConfig): OpencodeService {
  if (serviceInstance) {
    return serviceInstance
  }

  serviceInstance = new OpencodeService(config)
  return serviceInstance
}
