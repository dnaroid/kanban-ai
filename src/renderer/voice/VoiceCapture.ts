import {
  STTLanguage,
  STTStartInput,
  STTStopInput,
  STTAudioInput,
  STTStatusEvent,
  STTDeltaEvent,
  STTCommittedEvent,
  STTFinalEvent,
  STTFailedEvent,
  STTErrorEvent,
} from '@/shared/types/ipc'

const WORKLET_CODE = `
class PCM16Processor extends AudioWorkletProcessor {
  constructor() {
    super()
    this.sourceSampleRate = sampleRate
    this.targetSampleRate = 16000
    this.resamplingRatio = this.sourceSampleRate / this.targetSampleRate
    this.resamplingTimeOffset = 0
    this.previousSample = 0
    this.samplesPerChunk = 320
    this.chunkBuffer = new Int16Array(this.samplesPerChunk)
    this.chunkBufferPointer = 0
  }

  process(inputs) {
    const inputChannels = inputs[0]
    const monoChannel = inputChannels && inputChannels[0]
    if (!monoChannel) return true

    let offset = this.resamplingTimeOffset
    while (offset < monoChannel.length) {
      const previousIndex = Math.floor(offset)
      const nextIndex = Math.min(previousIndex + 1, monoChannel.length - 1)
      const interpolationFactor = offset - previousIndex
      const previousValue = previousIndex >= 0 ? monoChannel[previousIndex] : this.previousSample
      const nextValue = monoChannel[nextIndex]
      const interpolatedSample = previousValue + (nextValue - previousValue) * interpolationFactor
      const clampedSample = Math.max(-1, Math.min(1, interpolatedSample))
      const pcm16Sample = clampedSample < 0 ? Math.round(clampedSample * 0x8000) : Math.round(clampedSample * 0x7fff)
      this.chunkBuffer[this.chunkBufferPointer++] = pcm16Sample
      if (this.chunkBufferPointer >= this.samplesPerChunk) {
        const chunk = new Int16Array(this.chunkBuffer)
        this.port.postMessage(chunk, [chunk.buffer])
        this.chunkBufferPointer = 0
      }
      offset += this.resamplingRatio
    }

    this.resamplingTimeOffset = offset - monoChannel.length
    if (monoChannel.length > 0) {
      this.previousSample = monoChannel[monoChannel.length - 1]
    }
    return true
  }
}
try {
  registerProcessor('pcm16-processor', PCM16Processor)
} catch (error) {
  const message = error instanceof Error ? error.message : ''
  if (!message.includes('already registered')) {
    throw error
  }
}
`

interface STTApi {
  start(input: STTStartInput): Promise<void>
  stop(input: STTStopInput): Promise<void>
  setLanguage(input: { editorId: string; language: STTLanguage }): Promise<void>
  sendAudio(input: STTAudioInput): Promise<void>
  onStatus(callback: (event: STTStatusEvent) => void): () => void
  onDelta(callback: (event: STTDeltaEvent) => void): () => void
  onCommitted(callback: (event: STTCommittedEvent) => void): () => void
  onFinal(callback: (event: STTFinalEvent) => void): () => void
  onFailed(callback: (event: STTFailedEvent) => void): () => void
  onError(callback: (event: STTErrorEvent) => void): () => void
}

export class VoiceCapture {
  private audioContext: AudioContext | null = null
  private sourceNode: MediaStreamAudioSourceNode | null = null
  private workletNode: AudioWorkletNode | null = null
  private outputNode: GainNode | null = null
  private stream: MediaStream | null = null
  private currentEditorId: string | null = null
  private workletModuleLoaded = false

  private get stt(): STTApi {
    return (window.api as any).stt
  }

  async start(editorId: string, language: STTLanguage): Promise<void> {
    try {
      this.currentEditorId = editorId

      if (!this.audioContext) {
        this.audioContext = new AudioContext()
        this.workletModuleLoaded = false
      }

      if (this.audioContext.state === 'suspended') {
        await this.audioContext.resume()
      }

      if (!this.workletModuleLoaded) {
        const blob = new Blob([WORKLET_CODE], { type: 'application/javascript' })
        const workletUrl = URL.createObjectURL(blob)
        await this.audioContext.audioWorklet.addModule(workletUrl)
        URL.revokeObjectURL(workletUrl)
        this.workletModuleLoaded = true
      }

      this.stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      this.sourceNode = this.audioContext.createMediaStreamSource(this.stream)

      this.workletNode = new AudioWorkletNode(this.audioContext, 'pcm16-processor')
      this.outputNode = this.audioContext.createGain()
      this.outputNode.gain.value = 0

      this.workletNode.port.onmessage = (event) => {
        const pcm16Data = event.data as Int16Array
        this.sendAudio(pcm16Data)
      }

      this.sourceNode.connect(this.workletNode)
      this.workletNode.connect(this.outputNode)
      this.outputNode.connect(this.audioContext.destination)

      await this.stt.start({ editorId, language, mode: 'toggle' })
    } catch (error) {
      console.error('Failed to start VoiceCapture:', error)
      throw error
    }
  }

  async stop(): Promise<void> {
    const editorId = this.currentEditorId

    if (this.sourceNode) {
      this.sourceNode.disconnect()
      this.sourceNode = null
    }

    if (this.workletNode) {
      this.workletNode.disconnect()
      this.workletNode = null
    }

    if (this.outputNode) {
      this.outputNode.disconnect()
      this.outputNode = null
    }

    if (this.stream) {
      this.stream.getTracks().forEach((track) => track.stop())
      this.stream = null
    }

    if (editorId) {
      await this.stt.stop({ editorId })
    }

    this.currentEditorId = null
  }

  private sendAudio(pcm16Data: Int16Array): void {
    if (!this.currentEditorId) return

    const base64 = this.arrayBufferToBase64(pcm16Data.buffer as ArrayBuffer)
    this.stt.sendAudio({
      editorId: this.currentEditorId,
      pcm16Base64: base64,
    })
  }

  private arrayBufferToBase64(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer)
    let binary = ''
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i])
    }
    return window.btoa(binary)
  }
}

export const voiceCapture = new VoiceCapture()
