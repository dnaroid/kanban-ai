import fs from 'node:fs'
import path from 'path'
import { app } from 'electron'

type LogLevel = 'info' | 'warn' | 'error' | 'debug'

interface LogEntry {
  timestamp: string
  level: LogLevel
  message: string
  context?: string
}

class Logger {
  private logs: LogEntry[] = []
  private maxMemoryLogs = 1000
  private logFilePath: string

  constructor() {
    const userData = app.getPath('userData')
    this.logFilePath = path.join(userData, 'main.log')

    this.ensureLogFile()
  }

  private ensureLogFile(): void {
    const dir = path.dirname(this.logFilePath)
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }

    if (!fs.existsSync(this.logFilePath)) {
      fs.writeFileSync(this.logFilePath, '', 'utf-8')
    }
  }

  private writeToFile(entry: LogEntry): void {
    const line = `[${entry.timestamp}] [${entry.level.toUpperCase()}] ${entry.context ? `[${entry.context}] ` : ''}${entry.message}\n`
    fs.appendFileSync(this.logFilePath, line, 'utf-8')
  }

  private addEntry(level: LogLevel, message: string, context?: string): void {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      context
    }

    this.logs.push(entry)

    if (this.logs.length > this.maxMemoryLogs) {
      this.logs.shift()
    }

    this.writeToFile(entry)

    if (process.env.NODE_ENV === 'development') {
      console.log(`[${level.toUpperCase()}]${context ? ` [${context}]` : ''} ${message}`)
    }
  }

  info(message: string, context?: string): void {
    this.addEntry('info', message, context)
  }

  warn(message: string, context?: string): void {
    this.addEntry('warn', message, context)
  }

  error(message: string, context?: string, error?: unknown): void {
    const errorMessage = error instanceof Error ? error.message : String(error)
    this.addEntry('error', `${message}: ${errorMessage}`, context)
  }

  debug(message: string, context?: string): void {
    this.addEntry('debug', message, context)
  }

  getLogs(limit = 100): LogEntry[] {
    return this.logs.slice(-limit)
  }

  getLogsByLevel(level: LogLevel, limit = 100): LogEntry[] {
    return this.logs.filter(l => l.level === level).slice(-limit)
  }

  clearMemory(): void {
    this.logs = []
  }

  getLogFilePath(): string {
    return this.logFilePath
  }
}

export const logger = new Logger()
