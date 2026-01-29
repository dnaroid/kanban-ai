import fs from 'node:fs'
import path from 'node:path'
import { app } from 'electron'
import type { PluginManifest } from '../../shared/types/ipc'

const PLUGINS_DIR = path.join(app.getPath('userData'), 'plugins')

const ensurePluginsDir = () => {
  if (!fs.existsSync(PLUGINS_DIR)) {
    fs.mkdirSync(PLUGINS_DIR, { recursive: true })
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

const parseManifest = (raw: string): PluginManifest => {
  const parsed = JSON.parse(raw)
  if (!isRecord(parsed)) {
    throw new Error('Invalid manifest format')
  }

  const id = typeof parsed.id === 'string' ? parsed.id : ''
  const name = typeof parsed.name === 'string' ? parsed.name : ''
  const version = typeof parsed.version === 'string' ? parsed.version : ''
  const type = typeof parsed.type === 'string' ? parsed.type : ''
  const entrypoint = typeof parsed.entrypoint === 'string' ? parsed.entrypoint : ''
  const permissions = isRecord(parsed.permissions) ? parsed.permissions : {}

  if (!id || !name || !version || !type || !entrypoint) {
    throw new Error('Manifest is missing required fields')
  }

  if (!['role', 'executor', 'integration', 'ui'].includes(type)) {
    throw new Error('Unsupported plugin type')
  }

  return {
    id,
    name,
    version,
    type: type as PluginManifest['type'],
    entrypoint,
    permissions: {
      canRegisterRoles: Boolean(permissions.canRegisterRoles),
      canRegisterExecutors: Boolean(permissions.canRegisterExecutors),
      canCallNetwork: Boolean(permissions.canCallNetwork),
    },
  }
}

export const loadManifestFromPath = (pluginPath: string): PluginManifest => {
  const manifestPath = path.join(pluginPath, 'manifest.json')
  if (!fs.existsSync(manifestPath)) {
    throw new Error('Manifest not found in plugin directory')
  }

  const raw = fs.readFileSync(manifestPath, 'utf8')
  return parseManifest(raw)
}

export const installPlugin = (sourcePath: string) => {
  ensurePluginsDir()
  const manifest = loadManifestFromPath(sourcePath)
  const destination = path.join(PLUGINS_DIR, manifest.id)

  if (fs.existsSync(destination)) {
    fs.rmSync(destination, { recursive: true, force: true })
  }

  fs.cpSync(sourcePath, destination, { recursive: true })

  const entrypointPath = path.join(destination, manifest.entrypoint)
  if (!fs.existsSync(entrypointPath)) {
    throw new Error('Plugin entrypoint not found')
  }

  return { manifest, destination }
}

export const getPluginPath = (pluginId: string) => path.join(PLUGINS_DIR, pluginId)
