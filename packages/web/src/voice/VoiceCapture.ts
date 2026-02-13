import type { STTWorkerController } from './voice/STTWorkerController'

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
    this.chunkCount = 0
    this.lastLogTime = currentTime
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
        this.chunkCount++
        if (currentTime - this.lastLogTime > 5.0) {
          this.lastLogTime = currentTime
        }
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

export class VoiceCapture {
  private context: AudioContext | null = null
  private stream: MediaStream | null = null
  private worklet: AudioWorkletNode | null = null
  private source: MediaStreamAudioSourceNode | null = null
  private silentOutput: GainNode | null = null
  private sttController: STTWorkerController
  private workletModuleLoaded = false

  constructor(sttController: STTWorkerController) {
    this.sttController = sttController
  }

  async start(): Promise<void> {
    try {
      if (!this.context) {
        this.context = new AudioContext({ sampleRate: 16000 })
        this.workletModuleLoaded = false
      }

      if (this.context.state === 'suspended') {
        await this.context.resume()
      }

      if (!this.workletModuleLoaded) {
        const blob = new Blob([WORKLET_CODE], { type: 'application/javascript' })
        const workletUrl = URL.createObjectURL(blob)
        await this.context.audioWorklet.addModule(workletUrl)
        URL.revokeObjectURL(workletUrl)
        this.workletModuleLoaded = true
      }

      this.stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      this.source = this.context.createMediaStreamSource(this.stream)

      this.worklet = new AudioWorkletNode(this.context, 'pcm16-processor')
      this.silentOutput = this.context.createGain()
      this.silentOutput.gain.value = 0

      this.worklet.port.onmessage = (e: MessageEvent<Int16Array>) => {
        const chunk = e.data
        this.sttController.sendAudioChunk(chunk)
      }

      this.source.connect(this.worklet)
      this.worklet.connect(this.silentOutput)
      this.silentOutput.connect(this.context.destination)
    } catch (error) {
      console.error('Failed to start VoiceCapture:', error)
      throw error
    }
  }

  stop(): void {
    if (this.source) {
      this.source.disconnect()
      this.source = null
    }

    if (this.worklet) {
      this.worklet.disconnect()
      this.worklet.port.onmessage = null
      this.worklet = null
    }

    if (this.silentOutput) {
      this.silentOutput.disconnect()
      this.silentOutput = null
    }

    if (this.stream) {
      this.stream.getTracks().forEach((track) => track.stop())
      this.stream = null
    }
  }

  dispose(): void {
    this.stop()

    if (this.context) {
      this.context.close()
      this.context = null
    }
  }
}
