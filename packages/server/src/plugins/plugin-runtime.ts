import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import type { PluginManifest } from '@shared/types/ipc'
import { agentRoleRepo } from '../db/agent-role-repository'
import { getPluginPath } from './plugin-loader'

type RolePresetDefinition = {
  name: string
  description?: string
  preset: Record<string, unknown>
}

type ExecutorFactory = () => unknown

const executorRegistry = new Map<string, { pluginId: string; factory: ExecutorFactory }>()

const registerRolePreset = (
  _pluginId: string,
  roleId: string,
  definition: RolePresetDefinition
) => {
  if (!roleId || !definition?.name || !definition?.preset) {
    throw new Error('Invalid role preset definition')
  }

  agentRoleRepo.upsert(roleId, {
    name: definition.name,
    description: definition.description ?? '',
    preset: definition.preset,
  })
}

const registerExecutor = (pluginId: string, executorId: string, factory: ExecutorFactory) => {
  if (!executorId || typeof factory !== 'function') {
    throw new Error('Invalid executor registration')
  }
  executorRegistry.set(executorId, { pluginId, factory })
}

export const resetPluginRegistries = () => {
  executorRegistry.clear()
}

export const getExecutorRegistry = () => new Map(executorRegistry)

const createPluginApi = (pluginId: string) => ({
  registerRolePreset: (roleId: string, definition: RolePresetDefinition) =>
    registerRolePreset(pluginId, roleId, definition),
  registerExecutor: (executorId: string, factory: ExecutorFactory) =>
    registerExecutor(pluginId, executorId, factory),
})

export const loadPluginRuntime = (pluginId: string, manifest: PluginManifest) => {
  const pluginPath = getPluginPath(pluginId)
  const entryPath = path.join(pluginPath, manifest.entrypoint)
  const code = fs.readFileSync(entryPath, 'utf8')

  const context = vm.createContext({
    plugin: createPluginApi(pluginId),
    console,
  })

  const script = new vm.Script(code, { filename: entryPath })
  script.runInContext(context, { timeout: 1000 })
}
