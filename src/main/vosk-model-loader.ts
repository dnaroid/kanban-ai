import { app } from 'electron'
import * as fs from 'fs'
import * as path from 'path'

const MODELS_CACHE_DIR = path.join(app.getPath('userData'), 'vosk-models')
const MODEL_URLS = {
  ru: 'https://alphacephei.com/vosk/models/vosk-model-small-ru-0.22.zip',
  en: 'https://alphacephei.com/vosk/models/vosk-model-small-en-us-0.15.zip',
}

if (!fs.existsSync(MODELS_CACHE_DIR)) {
  fs.mkdirSync(MODELS_CACHE_DIR, { recursive: true })
}

export async function downloadModelIfNeeded(lang: 'ru' | 'en'): Promise<Buffer> {
  const modelUrl = MODEL_URLS[lang]
  const fileName = path.basename(modelUrl)
  const localPath = path.join(MODELS_CACHE_DIR, fileName)

  if (fs.existsSync(localPath)) {
    console.log(`[VoskModelLoader] Model ${lang} already cached at ${localPath}`)
    return fs.readFileSync(localPath)
  }

  console.log(`[VoskModelLoader] Downloading model ${lang} from ${modelUrl}...`)

  const response = await fetch(modelUrl)
  if (!response.ok) {
    throw new Error(`Failed to download model: ${response.statusText}`)
  }

  const arrayBuffer = await response.arrayBuffer()
  const buffer = Buffer.from(arrayBuffer)

  fs.writeFileSync(localPath, buffer)
  console.log(`[VoskModelLoader] Model ${lang} downloaded to ${localPath}`)

  return buffer
}

export function getModelPath(lang: 'ru' | 'en'): string | null {
  const fileName = path.basename(MODEL_URLS[lang])
  const localPath = path.join(MODELS_CACHE_DIR, fileName)

  return fs.existsSync(localPath) ? localPath : null
}
