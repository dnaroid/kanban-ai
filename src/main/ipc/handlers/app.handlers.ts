import { app, dialog, shell } from 'electron'
import type { OpenDialogOptions } from 'electron'
import path from 'path'
import fs from 'fs/promises'
import { constants as fsConstants } from 'fs'
import { ipcHandlers } from '../validation'
import { z } from 'zod'
import {
  AppInfoSchema,
  AppSettingGetDefaultModelInputSchema,
  AppSettingGetDefaultModelResponseSchema,
  AppSettingGetLastProjectIdResponseSchema,
  AppSettingGetOhMyOpencodePathResponseSchema,
  AppSettingGetSidebarCollapsedResponseSchema,
  AppSettingSetDefaultModelInputSchema,
  AppSettingSetDefaultModelResponseSchema,
  AppSettingSetLastProjectIdInputSchema,
  AppSettingSetLastProjectIdResponseSchema,
  AppSettingSetOhMyOpencodePathInputSchema,
  AppSettingSetOhMyOpencodePathResponseSchema,
  AppSettingSetSidebarCollapsedInputSchema,
  AppSettingSetSidebarCollapsedResponseSchema,
  DatabaseDeleteInputSchema,
  DatabaseDeleteResponseSchema,
} from '../../../shared/types/ipc.js'
import { appSettingsRepo } from '../../db/app-settings-repository.js'
import { dbManager } from '../../db'

export function registerAppHandlers(): void {
  ipcHandlers.register('project:selectFolder', z.unknown(), async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory', 'createDirectory'],
      title: 'Select Project Folder',
    })

    if (result.canceled || result.filePaths.length === 0) {
      return null
    }

    const selectedPath = result.filePaths[0]
    const projectName = path.basename(selectedPath)

    return {
      path: selectedPath,
      name: projectName,
    }
  })

  ipcHandlers.register('project:selectFiles', z.unknown(), async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile', 'multiSelections'],
      title: 'Select Files',
    })

    if (result.canceled || result.filePaths.length === 0) {
      return null
    }

    return result.filePaths
  })

  ipcHandlers.register('app:getInfo', z.unknown(), async () => {
    return AppInfoSchema.parse({
      name: app.getName(),
      version: app.getVersion(),
      platform: process.platform,
      arch: process.arch,
      electronVersion: process.versions.electron,
      chromeVersion: process.versions.chrome,
      nodeVersion: process.versions.node,
      mode: app.isPackaged ? 'production' : 'development',
      userDataPath: app.getPath('userData'),
    })
  })

  ipcHandlers.register('app:openPath', z.string(), async (_, path) => {
    await shell.openPath(path)
  })

  ipcHandlers.register('dialog:showOpenDialog', z.unknown(), async (_, input) => {
    const options = (input ?? {}) as OpenDialogOptions
    const result = await dialog.showOpenDialog(options)
    return result
  })

  ipcHandlers.register('fileSystem:exists', z.object({ path: z.string() }), async (_, input) => {
    try {
      await fs.access(input.path, fsConstants.F_OK)
      return { exists: true }
    } catch {
      return { exists: false }
    }
  })

  ipcHandlers.register('appSetting:getLastProjectId', z.unknown(), async () => {
    const projectId = appSettingsRepo.getLastProjectId()
    return AppSettingGetLastProjectIdResponseSchema.parse({ projectId })
  })

  ipcHandlers.register(
    'appSetting:setLastProjectId',
    AppSettingSetLastProjectIdInputSchema,
    async (_, input) => {
      appSettingsRepo.setLastProjectId(input.projectId)
      return AppSettingSetLastProjectIdResponseSchema.parse({ ok: true })
    }
  )

  ipcHandlers.register('appSetting:getSidebarCollapsed', z.unknown(), async () => {
    const collapsed = appSettingsRepo.getSidebarCollapsed()
    return AppSettingGetSidebarCollapsedResponseSchema.parse({ collapsed })
  })

  ipcHandlers.register(
    'appSetting:setSidebarCollapsed',
    AppSettingSetSidebarCollapsedInputSchema,
    async (_, input) => {
      appSettingsRepo.setSidebarCollapsed(input.collapsed)
      return AppSettingSetSidebarCollapsedResponseSchema.parse({ ok: true })
    }
  )

  ipcHandlers.register(
    'appSetting:getDefaultModel',
    AppSettingGetDefaultModelInputSchema,
    async (_, input) => {
      const modelName = appSettingsRepo.getDefaultModel(input.difficulty)
      return AppSettingGetDefaultModelResponseSchema.parse({ modelName })
    }
  )

  ipcHandlers.register(
    'appSetting:setDefaultModel',
    AppSettingSetDefaultModelInputSchema,
    async (_, input) => {
      appSettingsRepo.setDefaultModel(input.difficulty, input.modelName)
      return AppSettingSetDefaultModelResponseSchema.parse({ ok: true })
    }
  )

  ipcHandlers.register('appSetting:getOhMyOpencodePath', z.unknown(), async () => {
    const configPath = appSettingsRepo.getOhMyOpencodeConfigPath()
    return AppSettingGetOhMyOpencodePathResponseSchema.parse({ path: configPath })
  })

  ipcHandlers.register(
    'appSetting:setOhMyOpencodePath',
    AppSettingSetOhMyOpencodePathInputSchema,
    async (_, input) => {
      appSettingsRepo.setOhMyOpencodeConfigPath(input.path)
      return AppSettingSetOhMyOpencodePathResponseSchema.parse({ ok: true })
    }
  )

  ipcHandlers.register('database:delete', DatabaseDeleteInputSchema, async () => {
    dbManager.deleteDatabase()
    return DatabaseDeleteResponseSchema.parse({ ok: true })
  })
}
