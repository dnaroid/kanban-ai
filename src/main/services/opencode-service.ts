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
    // Сначала пробуем /health, если не работает - пробуем корневой /
    for (const path of ['/health', '/']) {
      try {
        const response = await fetch(`http://127.0.0.1:${this.config.port}${path}`, {
          method: 'GET',
          signal: AbortSignal.timeout(5000),
        })
        if (response.ok) {
          return true
        }
      } catch {
        continue
      }
    }
    return false
  }

  async start(): Promise<void> {
    console.log(
      `[OpencodeService] Проверка статуса OpenCode сервера на порту ${this.config.port}...`
    )
    const isCurrentlyRunning = await this.isRunning()

    if (isCurrentlyRunning) {
      console.log(`[OpencodeService] ✓ OpenCode сервер уже запущен на порту ${this.config.port}`)
      return
    }

    console.log(`[OpencodeService] Запуск OpenCode сервера на порту ${this.config.port}...`)

    const args = ['serve', '--port', this.config.port.toString()]

    console.log(`[OpencodeService] Команда: opencode ${args.join(' ')}`)

    this.process = spawn('opencode', args, {
      detached: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    const logStream = this.config.logFile
      ? (await import('node:fs')).createWriteStream(this.config.logFile)
      : process.stdout

    let allOutput = ''

    this.process.stdout?.on('data', (data) => {
      const output = data.toString().trim()
      allOutput += output + '\n'
      if (output) {
        logStream.write(`[OpenCode] ${output}\n`)
      }
    })

    this.process.stderr?.on('data', (data) => {
      const error = data.toString().trim()
      allOutput += error + '\n'
      if (error) {
        logStream.write(`[OpenCode Error] ${error}\n`)
      }
    })

    this.process.on('error', (error) => {
      logStream.write(`[OpencodeService] Ошибка запуска: ${error}\n`)
      console.error(`[OpencodeService] Spawn error:`, error)
    })

    this.process.on('exit', (code) => {
      if (!this.isShuttingDown) {
        const msg = `[OpencodeService] Процесс завершился с кодом: ${code}`
        logStream.write(`${msg}\n`)
        console.error(msg)
        console.error('[OpencodeService] Вывод процесса:', allOutput)
      }
      this.process = null
    })

    try {
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(
            new Error(
              `Таймаут ожидания запуска OpenCode сервера (10 сек)\nВывод: ${allOutput.substring(0, 500)}`
            )
          )
        }, 10000)

        const checkListener = (data: Buffer) => {
          const output = data.toString()
          const startupIndicators = ['listening', 'Server running', 'ready', 'Started']
          if (startupIndicators.some((indicator) => output.includes(indicator))) {
            clearTimeout(timeout)
            console.log(
              `[OpencodeService] Обнаружено сообщение о запуске: ${output.trim().substring(0, 100)}`
            )
            resolve()
          }
        }

        this.process?.stdout?.on('data', checkListener)
        this.process?.stderr?.on('data', checkListener)

        const healthCheckInterval = setInterval(async () => {
          if (await this.isRunning()) {
            clearInterval(healthCheckInterval)
            clearTimeout(timeout)
            console.log('[OpencodeService] HTTP health check успешен')
            resolve()
          }
        }, 1000)

        Promise.race([
          new Promise((resolve) => this.process?.on('exit', resolve)),
          new Promise((resolve) => setTimeout(() => resolve(undefined), 11000)),
        ]).then(() => {
          clearInterval(healthCheckInterval)
        })
      })

      const finalCheck = await this.isRunning()
      if (!finalCheck) {
        throw new Error(`Сервер не отвечает после запуска\nВывод: ${allOutput.substring(0, 500)}`)
      }

      console.log(
        `[OpencodeService] ✓ OpenCode сервер успешно запущен и отвечает на порту ${this.config.port}`
      )
    } catch (error) {
      this.process?.kill('SIGTERM')
      throw error
    }
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
