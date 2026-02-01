class PCM16Processor extends AudioWorkletProcessor {
  constructor() {
    super()
    this.sourceSampleRate = sampleRate
    this.targetSampleRate = 24000
    this.resamplingRatio = this.sourceSampleRate / this.targetSampleRate

    this.resamplingTimeOffset = 0
    this.previousSample = 0

    this.samplesPerChunk = 480
    this.chunkBuffer = new Int16Array(this.samplesPerChunk)
    this.chunkBufferPointer = 0
  }

  process(inputs) {
    const inputChannels = inputs[0]
    const monoChannel = inputChannels && inputChannels[0]

    if (!monoChannel) return true

    for (let i = 0; i < monoChannel.length; i++) {
      const currentSample = monoChannel[i]

      while (this.resamplingTimeOffset < 1) {
        const interpolatedSample =
          this.previousSample * (1 - this.resamplingTimeOffset) +
          currentSample * this.resamplingTimeOffset

        const clampedSample = Math.max(-1, Math.min(1, interpolatedSample))
        const int16Sample = clampedSample < 0 ? clampedSample * 0x8000 : clampedSample * 0x7fff

        this.chunkBuffer[this.chunkBufferPointer++] = int16Sample | 0

        if (this.chunkBufferPointer >= this.samplesPerChunk) {
          const chunkToPost = new Int16Array(this.chunkBuffer)
          this.port.postMessage(chunkToPost, [chunkToPost.buffer])
          this.chunkBufferPointer = 0
        }

        this.resamplingTimeOffset += this.resamplingRatio
      }

      this.resamplingTimeOffset -= 1
      this.previousSample = currentSample
    }

    return true
  }
}

registerProcessor('pcm16-worklet', PCM16Processor)
