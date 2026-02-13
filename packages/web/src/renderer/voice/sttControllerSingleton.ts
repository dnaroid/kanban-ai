import { STTWorkerController } from './STTWorkerController'

let controller: STTWorkerController | null = null

export function getSTTController(modelPaths: Record<'ru' | 'en', string>): STTWorkerController {
  if (!controller) {
    controller = new STTWorkerController(modelPaths)
  }

  return controller
}
