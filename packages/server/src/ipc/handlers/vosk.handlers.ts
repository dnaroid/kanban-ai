import { ipcHandlers } from '../validation'
import { VoskModelDownloadInputSchema, VoskModelDownloadResponseSchema } from "../../shared/src/types/ipc.js'
import { downloadModelIfNeeded } from '../../vosk/vosk-model-loader'

export function registerVoskHandlers(): void {
  ipcHandlers.register('vosk:downloadModel', VoskModelDownloadInputSchema, async (_, input) => {
    const buffer = await downloadModelIfNeeded(input.lang)
    return VoskModelDownloadResponseSchema.parse({ path: buffer.toString('base64') })
  })
}
