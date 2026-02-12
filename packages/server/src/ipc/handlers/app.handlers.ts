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
  AppSettingGetRetentionPolicyResponseSchema,
  AppSettingSetRetentionPolicyInputSchema,
  AppSettingSetRetentionPolicyResponseSchema,
  AppSettingRunRetentionCleanupInputSchema,
  AppSettingRunRetentionCleanupResponseSchema,
  AppSettingSetSidebarCollapsedInputSchema,
  AppSettingSetSidebarCollapsedResponseSchema,
  DatabaseDeleteInputSchema,
  DatabaseDeleteResponseSchema,
} from '../../../../shared/dist/types/ipc'
import { dbManager } from '../../db'
import { retentionMaintenanceService } from '../../maintenance/retention-maintenance.service.js'
import type { AppContext } from '../composition/create-app-context'

export function registerAppHandlers(context: AppContext): void {
  const {
    getLastProjectId,
    setLastProjectId,
    getSidebarCollapsed,
    setSidebarCollapsed,
    getDefaultModel,
    setDefaultModel,
    getOhMyOpencodePath,
    setOhMyOpencodePath,
    getRetentionEnabled,
    setRetentionEnabled,
    getRetentionDays,
    setRetentionDays,
  } = context

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
    const projectId = getLastProjectId()
    return AppSettingGetLastProjectIdResponseSchema.parse({ projectId })
  })

  ipcHandlers.register(
    'appSetting:setLastProjectId',
    AppSettingSetLastProjectIdInputSchema,
    async (_, input) => {
      setLastProjectId(input.projectId)
      return AppSettingSetLastProjectIdResponseSchema.parse({ ok: true })
    }
  )

  ipcHandlers.register('appSetting:getSidebarCollapsed', z.unknown(), async () => {
    const collapsed = getSidebarCollapsed()
    return AppSettingGetSidebarCollapsedResponseSchema.parse({ collapsed })
  })

  ipcHandlers.register(
    'appSetting:setSidebarCollapsed',
    AppSettingSetSidebarCollapsedInputSchema,
    async (_, input) => {
      setSidebarCollapsed(input.collapsed)
      return AppSettingSetSidebarCollapsedResponseSchema.parse({ ok: true })
    }
  )

  ipcHandlers.register(
    'appSetting:getDefaultModel',
    AppSettingGetDefaultModelInputSchema,
    async (_, input) => {
      const modelName = getDefaultModel(input.difficulty)
      return AppSettingGetDefaultModelResponseSchema.parse({ modelName })
    }
  )

  ipcHandlers.register(
    'appSetting:setDefaultModel',
    AppSettingSetDefaultModelInputSchema,
    async (_, input) => {
      setDefaultModel(input.difficulty, input.modelName)
      return AppSettingSetDefaultModelResponseSchema.parse({ ok: true })
    }
  )

  ipcHandlers.register('appSetting:getOhMyOpencodePath', z.unknown(), async () => {
    const configPath = getOhMyOpencodePath()
    return AppSettingGetOhMyOpencodePathResponseSchema.parse({ path: configPath })
  })

  ipcHandlers.register(
    'appSetting:setOhMyOpencodePath',
    AppSettingSetOhMyOpencodePathInputSchema,
    async (_, input) => {
      setOhMyOpencodePath(input.path)
      return AppSettingSetOhMyOpencodePathResponseSchema.parse({ ok: true })
    }
  )

  ipcHandlers.register('appSetting:getRetentionPolicy', z.unknown(), async () => {
    const enabled = getRetentionEnabled()
    const days = getRetentionDays()
    return AppSettingGetRetentionPolicyResponseSchema.parse({ enabled, days })
  })

  ipcHandlers.register(
    'appSetting:setRetentionPolicy',
    AppSettingSetRetentionPolicyInputSchema,
    async (_, input) => {
      setRetentionEnabled(input.enabled)
      setRetentionDays(input.days)
      return AppSettingSetRetentionPolicyResponseSchema.parse({ ok: true })
    }
  )

  ipcHandlers.register(
    'appSetting:runRetentionCleanup',
    AppSettingRunRetentionCleanupInputSchema,
    async (_, input) => {
      const days = getRetentionDays()
      const result = retentionMaintenanceService.runCleanup({
        days,
        dryRun: input.dryRun,
        maxDeletes: input.maxDeletes,
      })
      return AppSettingRunRetentionCleanupResponseSchema.parse(result)
    }
  )

  ipcHandlers.register('database:delete', DatabaseDeleteInputSchema, async () => {
    dbManager.deleteDatabase()
    return DatabaseDeleteResponseSchema.parse({ ok: true })
  })
}
