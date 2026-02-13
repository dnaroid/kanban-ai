import { createModel } from 'vosk-browser'

export type STTStatus = 'idle' | 'initializing' | 'ready' | 'speech' | 'error'

export type STTEventMap = {
  status: STTStatus
  partial: string
  final: string
  error: string
}

export class STTWorkerController {
  private listeners: Map<keyof STTEventMap, Set<(data: unknown) => void>> = new Map()
  private currentStatus: STTStatus = 'idle'
  private currentLang: 'ru' | 'en' = 'ru'
  private modelPaths: Record<'ru' | 'en', string>
  private model: any = null
  private recognizer: any = null
  private modelObjectUrl: string | null = null

  constructor(modelPaths: Record<'ru' | 'en', string>) {
    this.modelPaths = modelPaths
  }

  async init(lang: 'ru' | 'en' = 'ru'): Promise<void> {
    this.currentLang = lang
    this.setStatus('initializing')

    try {
      await this.loadModel(lang)
      this.setStatus('ready')
    } catch (error) {
      this.setStatus('error')
      const message = error instanceof Error ? error.message : 'Failed to initialize model'
      this.emit('error', message)
      throw error
    }
  }

  sendAudioChunk(pcm16: Int16Array): void {
    if (!this.recognizer || this.currentStatus === 'initializing') {
      return
    }

    const float32Array = new Float32Array(pcm16.length)
    for (let i = 0; i < pcm16.length; i++) {
      float32Array[i] = pcm16[i] / 32768
    }

    const audioBuffer = new AudioBuffer({
      length: float32Array.length,
      numberOfChannels: 1,
      sampleRate: 16000,
    })
    audioBuffer.copyToChannel(float32Array, 0)

    let accepted = false
    try {
      accepted = this.recognizer.acceptWaveform(audioBuffer)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'acceptWaveform failed'
      this.setStatus('error')
      this.emit('error', message)
      return
    }

    const finalResult = this.recognizer.result?.()
    if (finalResult?.text) {
      this.emit('final', finalResult.text)
      this.setStatus('ready')
    }

    if (!accepted) {
      const partialResult = this.recognizer.partialResult?.()
      if (partialResult?.partial) {
        this.emit('partial', partialResult.partial)
      }
    }

    if (this.currentStatus === 'ready') {
      this.setStatus('speech')
    }
  }

  async setLanguage(lang: 'ru' | 'en'): Promise<void> {
    if (lang === this.currentLang) {
      return
    }

    this.currentLang = lang
    await this.init(lang)
  }

  reset(): void {
    if (!this.model) {
      return
    }

    if (this.recognizer) {
      this.recognizer.remove()
    }

    this.recognizer = new this.model.KaldiRecognizer(16000)
    this.recognizer.setWords(true)
    this.bindRecognizerEvents()
    this.setStatus('ready')
  }

  dispose(): void {
    if (this.recognizer) {
      this.recognizer.remove()
      this.recognizer = null
    }

    if (this.model) {
      this.model.terminate()
      this.model = null
    }

    if (this.modelObjectUrl) {
      URL.revokeObjectURL(this.modelObjectUrl)
      this.modelObjectUrl = null
    }

    this.listeners.clear()
    this.setStatus('idle')
  }

  on<K extends keyof STTEventMap>(event: K, handler: (data: STTEventMap[K]) => void): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set())
    }
    this.listeners.get(event)!.add(handler as (data: unknown) => void)
  }

  off<K extends keyof STTEventMap>(event: K, handler: (data: STTEventMap[K]) => void): void {
    const handlers = this.listeners.get(event)
    if (handlers) {
      handlers.delete(handler as (data: unknown) => void)
    }
  }

  getStatus(): STTStatus {
    return this.currentStatus
  }

  getCurrentLanguage(): 'ru' | 'en' {
    return this.currentLang
  }

  private async loadModel(lang: 'ru' | 'en'): Promise<void> {
    this.cleanupModel()

    const modelUrl = await this.resolveModelUrl(lang)
    this.model = await createModel(modelUrl)
    this.recognizer = new this.model.KaldiRecognizer(16000)
    this.recognizer.setWords(true)
    this.bindRecognizerEvents()
  }

  private bindRecognizerEvents(): void {
    if (!this.recognizer) {
      return
    }

    this.recognizer.on('result', (message: any) => {
      const text = message?.result?.text
      if (text) {
        this.emit('final', text)
        this.setStatus('ready')
      }
    })

    this.recognizer.on('partialresult', (message: any) => {
      const text = message?.result?.partial
      if (text) {
        this.emit('partial', text)
      }
    })
  }

  private cleanupModel(): void {
    if (this.recognizer) {
      this.recognizer.remove()
      this.recognizer = null
    }

    if (this.model) {
      this.model.terminate()
      this.model = null
    }

    if (this.modelObjectUrl) {
      URL.revokeObjectURL(this.modelObjectUrl)
      this.modelObjectUrl = null
    }
  }

  private async resolveModelUrl(lang: 'ru' | 'en'): Promise<string> {
    try {
      const result = await window.api.vosk.downloadModel({ lang })
      return this.base64ToBlobUrl(result.path)
    } catch (error) {
      const fallback = this.modelPaths[lang]
      if (!fallback) {
        throw error
      }
      return fallback
    }
  }

  private base64ToBlobUrl(base64: string): string {
    const binaryString = atob(base64)
    const bytes = new Uint8Array(binaryString.length)
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i)
    }

    const blob = new Blob([bytes], { type: 'application/zip' })
    const url = URL.createObjectURL(blob)
    this.modelObjectUrl = url
    return url
  }

  private emit<K extends keyof STTEventMap>(event: K, data: STTEventMap[K]): void {
    const handlers = this.listeners.get(event)
    if (handlers) {
      handlers.forEach((handler) => handler(data))
    }
  }

  private setStatus(status: STTStatus): void {
    if (this.currentStatus !== status) {
      this.currentStatus = status
      this.emit('status', status)
    }
  }
}
