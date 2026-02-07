import { ipcHandlers } from '../validation'
import {
  PluginsEnableInputSchema,
  PluginsEnableResponseSchema,
  PluginsInstallInputSchema,
  PluginsInstallResponseSchema,
  PluginsListResponseSchema,
  PluginsReloadResponseSchema,
  RolesListResponseSchema,
} from '../../../shared/types/ipc.js'
import { pluginService } from '../../plugins/plugin-service'
import type { AppContext } from '../composition/create-app-context'

export function registerPluginHandlers(context: AppContext): void {
  const { listAgentRoles } = context

  ipcHandlers.register('plugins:list', null, async () => {
    const plugins = pluginService.list()
    return PluginsListResponseSchema.parse({ plugins })
  })

  ipcHandlers.register('plugins:install', PluginsInstallInputSchema, async (_, input) => {
    const plugin = pluginService.install(input.path)
    return PluginsInstallResponseSchema.parse({ plugin })
  })

  ipcHandlers.register('plugins:enable', PluginsEnableInputSchema, async (_, input) => {
    const plugin = pluginService.enable(input.pluginId, input.enabled)
    return PluginsEnableResponseSchema.parse({ plugin })
  })

  ipcHandlers.register('plugins:reload', null, async () => {
    const plugins = pluginService.reload()
    return PluginsReloadResponseSchema.parse({ plugins })
  })

  ipcHandlers.register('roles:list', null, async () => {
    const roles = listAgentRoles()
    return RolesListResponseSchema.parse({ roles })
  })
}
