import { STTWorkerController } from './STTWorkerController'

let controller: STTWorkerController | null = null
let cachedModelPaths: Record<'ru' | 'en', string> | null = null

export function getSTTController(modelPaths: Record<'ru' | 'en', string>): STTWorkerController {
  if (!controller) {
    cachedModelPaths = modelPaths
    controller = new STTWorkerController(modelPaths)
  }

  return controller
}
