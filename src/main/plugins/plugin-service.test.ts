import { randomUUID } from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, it, expect, vi } from 'vitest'

let mockUserDataPath = ''

vi.mock('electron', () => ({
  app: {
    getPath: () => mockUserDataPath,
  },
}))

const createTempDir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'kanban-ai-test-'))

const setupDb = async () => {
  mockUserDataPath = createTempDir()
  vi.resetModules()

  const { dbManager } = await import('../db/index.js')
  const { agentRoleRepo } = await import('../db/agent-role-repository.js')
  const { pluginService } = await import('./plugin-service.js')

  return {
    dbManager,
    agentRoleRepo,
    pluginService,
    cleanup: () => {
      dbManager.disconnect()
      fs.rmSync(mockUserDataPath, { recursive: true, force: true })
    },
  }
}

const createPluginDir = (baseDir: string) => {
  const pluginDir = path.join(baseDir, `plugin-${randomUUID()}`)
  fs.mkdirSync(pluginDir, { recursive: true })

  const manifest = {
    id: 'test-plugin',
    name: 'Test Plugin',
    version: '0.0.1',
    type: 'role',
    permissions: {
      canRegisterRoles: true,
    },
    entrypoint: 'index.js',
  }

  fs.writeFileSync(path.join(pluginDir, 'manifest.json'), JSON.stringify(manifest, null, 2))
  fs.writeFileSync(
    path.join(pluginDir, 'index.js'),
    `plugin.registerRolePreset('plugin-role', {
      name: 'Plugin Role',
      description: 'Registered by plugin',
      preset: { role: 'plugin' },
    })`
  )

  return pluginDir
}

describe('pluginService', () => {
  it('installs and registers role presets from plugins', async () => {
    const { pluginService, agentRoleRepo, cleanup } = await setupDb()

    try {
      const pluginDir = createPluginDir(mockUserDataPath)
      const record = pluginService.install(pluginDir)
      expect(record.enabled).toBe(false)

      pluginService.enable(record.id, true)

      const roles = agentRoleRepo.list()
      expect(roles.some((role) => role.id === 'plugin-role')).toBe(true)
    } finally {
      cleanup()
    }
  })
})
