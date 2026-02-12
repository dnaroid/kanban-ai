import fs from 'node:fs'
import path from 'node:path'
import { pluginRepo } from './plugin-repository'
import { getPluginPath, installPlugin, loadManifestFromPath } from './plugin-loader'
import { loadPluginRuntime, resetPluginRegistries } from './plugin-runtime'
import type { PluginManifest, PluginRecord } from '../../../shared/dist/types/ipc'

const loadedPlugins = new Map<string, PluginManifest>()

const validateEntryPoint = (pluginId: string, manifest: PluginManifest) => {
  const pluginPath = getPluginPath(pluginId)
  const entryPath = path.join(pluginPath, manifest.entrypoint)
  if (!fs.existsSync(entryPath)) {
    throw new Error('Plugin entrypoint missing')
  }
}

const loadEnabledPlugins = () => {
  loadedPlugins.clear()
  resetPluginRegistries()
  const plugins = pluginRepo.list()
  for (const plugin of plugins) {
    if (!plugin.enabled) continue
    try {
      validateEntryPoint(plugin.id, plugin.manifest)
      loadPluginRuntime(plugin.id, plugin.manifest)
      loadedPlugins.set(plugin.id, plugin.manifest)
    } catch (error) {
      console.warn('[Plugins] Disabled plugin due to load error:', plugin.id, error)
      pluginRepo.setEnabled(plugin.id, false)
    }
  }
  return pluginRepo.list()
}

export const pluginService = {
  list(): PluginRecord[] {
    return pluginRepo.list()
  },
  install(sourcePath: string): PluginRecord {
    const { manifest } = installPlugin(sourcePath)
    return pluginRepo.upsert(manifest, false)
  },
  enable(pluginId: string, enabled: boolean): PluginRecord {
    const updated = pluginRepo.setEnabled(pluginId, enabled)
    if (enabled) {
      try {
        validateEntryPoint(pluginId, updated.manifest)
        loadPluginRuntime(pluginId, updated.manifest)
        loadedPlugins.set(pluginId, updated.manifest)
      } catch (error) {
        pluginRepo.setEnabled(pluginId, false)
        throw error
      }
    } else {
      loadedPlugins.delete(pluginId)
    }
    return updated
  },
  reload(): PluginRecord[] {
    return loadEnabledPlugins()
  },
  getLoadedPlugins(): Map<string, PluginManifest> {
    return new Map(loadedPlugins)
  },
  refreshManifest(pluginId: string): PluginRecord {
    const pluginPath = getPluginPath(pluginId)
    const manifest = loadManifestFromPath(pluginPath)
    return pluginRepo.upsert(manifest, true)
  },
}

loadEnabledPlugins()
