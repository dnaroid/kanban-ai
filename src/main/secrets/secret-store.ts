import { safeStorage } from 'electron'

export interface ISecretStore {
  setPassword(service: string, account: string, password: string): Promise<void>
  getPassword(service: string, account: string): Promise<string | null>
  deletePassword(service: string, account: string): Promise<boolean>
}

export class ElectronSafeStorage implements ISecretStore {
  async setPassword(service: string, account: string, password: string): Promise<void> {
    const key = `${service}:${account}`
    const encrypted = safeStorage.encryptString(password)

    const { app } = await import('electron')
    const path = await import('path')
    const fs = await import('node:fs')

    const dir = path.join(app.getPath('userData'), 'secrets')
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }

    const filePath = path.join(dir, `${key}.secret`)
    fs.writeFileSync(filePath, encrypted, 'utf-8')
  }

  async getPassword(service: string, account: string): Promise<string | null> {
    const key = `${service}:${account}`

    const { app } = await import('electron')
    const path = await import('path')
    const fs = await import('node:fs')

    const filePath = path.join(app.getPath('userData'), 'secrets', `${key}.secret`)

    if (!fs.existsSync(filePath)) {
      return null
    }

    try {
      const encrypted = fs.readFileSync(filePath, 'utf-8')
      return safeStorage.decryptString(Buffer.from(encrypted))
    } catch {
      return null
    }
  }

  async deletePassword(service: string, account: string): Promise<boolean> {
    const key = `${service}:${account}`

    const { app } = await import('electron')
    const path = await import('path')
    const fs = await import('node:fs')

    const filePath = path.join(app.getPath('userData'), 'secrets', `${key}.secret`)

    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath)
      return true
    }

    return false
  }
}

export class MockSecretStore implements ISecretStore {
  private store = new Map<string, string>()

  async setPassword(service: string, account: string, password: string): Promise<void> {
    const key = `${service}:${account}`
    this.store.set(key, password)
  }

  async getPassword(service: string, account: string): Promise<string | null> {
    const key = `${service}:${account}`
    return this.store.get(key) ?? null
  }

  async deletePassword(service: string, account: string): Promise<boolean> {
    const key = `${service}:${account}`
    return this.store.delete(key)
  }
}

let secretStoreInstance: ISecretStore | null = null

export function getSecretStore(): ISecretStore {
  if (secretStoreInstance) {
    return secretStoreInstance
  }

  const { safeStorage } = require('electron')

  if (safeStorage.isEncryptionAvailable()) {
    secretStoreInstance = new ElectronSafeStorage()
    console.log('[SecretStore] Using Electron safeStorage')
  } else {
    secretStoreInstance = new MockSecretStore()
    console.warn('[SecretStore] Using mock storage (encryption not available)')
  }

  return secretStoreInstance
}
