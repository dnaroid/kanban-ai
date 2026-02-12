import { homedir } from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import envPaths from 'env-paths'

export class PathsService {
  private dataDir: string
  private paths: ReturnType<typeof envPaths>

  constructor() {
    // Cross-platform data directory using env-paths
    this.paths = envPaths('kanban-ai', { suffix: '' })
    this.dataDir = this.paths.data
  }

  getDataDir(): string {
    return this.dataDir
  }

  getDbPath(): string {
    return path.join(this.dataDir, 'kanban.db')
  }

  getLogsDir(): string {
    return path.join(this.dataDir, 'logs')
  }

  getPluginsDir(): string {
    return path.join(this.dataDir, 'plugins')
  }

  getBackupsDir(): string {
    return path.join(this.dataDir, 'backups')
  }

  getTokenPath(): string {
    return path.join(this.dataDir, 'token')
  }

  ensureDataDir(): void {
    fs.mkdir(this.dataDir, { recursive: true }).catch((error: Error) => {
      console.error(`Failed to create data directory: ${error}`)
    })
  }

  async loadToken(): Promise<string | null> {
    try {
      const tokenContent = await fs.readFile(this.getTokenPath(), 'utf-8')
      return tokenContent.trim() || null
    } catch {
      return null
    }
  }

  async saveToken(token: string): Promise<void> {
    await fs.writeFile(this.getTokenPath(), token.trim(), 'utf-8')
  }

  async generateToken(): Promise<string> {
    return crypto.randomBytes(32).toString('hex')
  }
}
