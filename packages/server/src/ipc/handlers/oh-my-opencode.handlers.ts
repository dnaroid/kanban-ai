import path from 'path'
import fs from 'fs/promises'
import { parse } from 'jsonc-parser'
import { ipcHandlers } from '../validation'
import {
  OhMyOpencodeBackupConfigInputSchema,
  OhMyOpencodeBackupConfigResponseSchema,
  OhMyOpencodeListPresetsInputSchema,
  OhMyOpencodeListPresetsResponseSchema,
  OhMyOpencodeLoadPresetInputSchema,
  OhMyOpencodeLoadPresetResponseSchema,
  OhMyOpencodeReadConfigInputSchema,
  OhMyOpencodeReadConfigResponseSchema,
  OhMyOpencodeRestoreConfigInputSchema,
  OhMyOpencodeRestoreConfigResponseSchema,
  OhMyOpencodeSaveConfigInputSchema,
  OhMyOpencodeSaveConfigResponseSchema,
  OhMyOpencodeSavePresetInputSchema,
  OhMyOpencodeSavePresetResponseSchema,
} from '@shared/types/ipc.js'
import {
  buildOhMyOpencodeModelFields,
  isPlainObject,
  mergeInPlace,
  ORIGINAL_PRESET_NAME,
  PRESET_SUFFIX,
} from '../../oh-my-opencode/config-utils'

export function registerOhMyOpencodeHandlers(): void {
  ipcHandlers.register(
    'ohMyOpencode:readConfig',
    OhMyOpencodeReadConfigInputSchema,
    async (_, input) => {
      const fileContent = await fs.readFile(input.path, 'utf-8')
      const config = parse(fileContent) as Record<string, unknown>
      const modelFields = buildOhMyOpencodeModelFields(config)
      return OhMyOpencodeReadConfigResponseSchema.parse({ config, modelFields })
    }
  )

  ipcHandlers.register(
    'ohMyOpencode:saveConfig',
    OhMyOpencodeSaveConfigInputSchema,
    async (_, input) => {
      const fileContent = await fs.readFile(input.path, 'utf-8')
      const originalPath = path.join(path.dirname(input.path), ORIGINAL_PRESET_NAME)
      const originalExists = await fs
        .stat(originalPath)
        .then(() => true)
        .catch(() => false)

      if (!originalExists) {
        await fs.writeFile(originalPath, fileContent, 'utf-8')
      }

      const parsedConfig = parse(fileContent) as unknown
      let outputConfig: unknown = input.config
      if (isPlainObject(parsedConfig) && isPlainObject(input.config)) {
        mergeInPlace(parsedConfig, input.config)
        outputConfig = parsedConfig
      }

      await fs.writeFile(input.path, JSON.stringify(outputConfig, null, 2), 'utf-8')
      return OhMyOpencodeSaveConfigResponseSchema.parse({ ok: true })
    }
  )

  ipcHandlers.register(
    'ohMyOpencode:listPresets',
    OhMyOpencodeListPresetsInputSchema,
    async (_, input) => {
      const presetDir = path.dirname(input.path)
      const baseConfigName = path.basename(input.path)
      const entries = await fs.readdir(presetDir)

      const presets = entries
        .filter(
          (entry) =>
            entry.endsWith(PRESET_SUFFIX) &&
            entry !== ORIGINAL_PRESET_NAME &&
            entry !== baseConfigName
        )
        .map((entry) => entry.replace(PRESET_SUFFIX, ''))
        .sort((a, b) => a.localeCompare(b))

      return OhMyOpencodeListPresetsResponseSchema.parse({ presets })
    }
  )

  ipcHandlers.register(
    'ohMyOpencode:loadPreset',
    OhMyOpencodeLoadPresetInputSchema,
    async (_, input) => {
      const presetPath = path.join(path.dirname(input.path), `${input.presetName}${PRESET_SUFFIX}`)
      const fileContent = await fs.readFile(presetPath, 'utf-8')
      const config = parse(fileContent) as Record<string, unknown>
      const modelFields = buildOhMyOpencodeModelFields(config)
      return OhMyOpencodeLoadPresetResponseSchema.parse({ config, modelFields })
    }
  )

  ipcHandlers.register(
    'ohMyOpencode:savePreset',
    OhMyOpencodeSavePresetInputSchema,
    async (_, input) => {
      const presetPath = path.join(path.dirname(input.path), `${input.presetName}${PRESET_SUFFIX}`)
      await fs.writeFile(presetPath, JSON.stringify(input.config, null, 2), 'utf-8')
      return OhMyOpencodeSavePresetResponseSchema.parse({ ok: true, presetPath })
    }
  )

  ipcHandlers.register(
    'ohMyOpencode:backupConfig',
    OhMyOpencodeBackupConfigInputSchema,
    async (_, input) => {
      const fileContent = await fs.readFile(input.path, 'utf-8')
      const backupPath = `${input.path}.backup`
      await fs.writeFile(backupPath, fileContent, 'utf-8')
      return OhMyOpencodeBackupConfigResponseSchema.parse({ ok: true, backupPath })
    }
  )

  ipcHandlers.register(
    'ohMyOpencode:restoreConfig',
    OhMyOpencodeRestoreConfigInputSchema,
    async (_, input) => {
      const backupPath = `${input.path}.backup`
      const backupContent = await fs.readFile(backupPath, 'utf-8')
      await fs.writeFile(input.path, backupContent, 'utf-8')
      return OhMyOpencodeRestoreConfigResponseSchema.parse({ ok: true })
    }
  )
}
