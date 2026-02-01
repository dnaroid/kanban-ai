import fs from 'fs/promises'
import path from 'path'
import WebSocket from 'ws'

const USAGE = `
Usage:
  node scripts/stt-realtime-debug-ga.mjs --file <audio.wav|audio.pcm>

Options:
  --api-key <key>              Defaults to OPENAI_API_KEY
  --realtime-model <model>     Default: gpt-realtime
  --transcribe-model <model>   Default: gpt-4o-mini-transcribe
  --language <ru|en>           Default: ru
  --chunk-ms <number>          Default: 100
  --log-raw                    Log full event payloads
`

const args = process.argv.slice(2)

const readArg = (flag, alias) => {
  const primaryIndex = args.indexOf(flag)
  if (primaryIndex !== -1 && primaryIndex + 1 < args.length) {
    return args[primaryIndex + 1]
  }

  if (alias) {
    const aliasIndex = args.indexOf(alias)
    if (aliasIndex !== -1 && aliasIndex + 1 < args.length) {
      return args[aliasIndex + 1]
    }
  }

  return undefined
}

const hasFlag = (flag) => args.includes(flag)

const filePath = readArg('--file', '-f')
const apiKey = readArg('--api-key') ?? process.env.OPENAI_API_KEY
const realtimeModel = readArg('--realtime-model') ?? 'gpt-realtime'
const transcribeModel = readArg('--transcribe-model') ?? 'gpt-4o-mini-transcribe'
const language = readArg('--language') ?? 'ru'
const chunkMs = Number(readArg('--chunk-ms') ?? '100')
const logRaw = hasFlag('--log-raw')

if (!filePath) {
  console.error(USAGE)
  process.exit(1)
}

if (!apiKey) {
  console.error('Missing API key. Set OPENAI_API_KEY or pass --api-key.')
  process.exit(1)
}

if (Number.isNaN(chunkMs) || chunkMs < 0) {
  console.error('Invalid --chunk-ms value. Must be >= 0.')
  process.exit(1)
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const parseWav = (buffer) => {
  if (buffer.length < 44) {
    throw new Error('WAV file too small to be valid')
  }

  const riff = buffer.toString('ascii', 0, 4)
  const wave = buffer.toString('ascii', 8, 12)
  if (riff !== 'RIFF' || wave !== 'WAVE') {
    throw new Error('Not a valid WAV file (missing RIFF/WAVE)')
  }

  let offset = 12
  let fmt = null
  let dataOffset = -1
  let dataSize = 0

  while (offset + 8 <= buffer.length) {
    const chunkId = buffer.toString('ascii', offset, offset + 4)
    const chunkSize = buffer.readUInt32LE(offset + 4)
    const chunkStart = offset + 8

    if (chunkId === 'fmt ') {
      const audioFormat = buffer.readUInt16LE(chunkStart)
      const numChannels = buffer.readUInt16LE(chunkStart + 2)
      const sampleRate = buffer.readUInt32LE(chunkStart + 4)
      const bitsPerSample = buffer.readUInt16LE(chunkStart + 14)
      fmt = { audioFormat, numChannels, sampleRate, bitsPerSample }
    }

    if (chunkId === 'data') {
      dataOffset = chunkStart
      dataSize = chunkSize
    }

    const nextOffset = chunkStart + chunkSize + (chunkSize % 2)
    if (nextOffset <= offset) {
      break
    }

    offset = nextOffset
    if (fmt && dataOffset !== -1) {
      break
    }
  }

  if (!fmt) {
    throw new Error('WAV fmt chunk not found')
  }

  if (dataOffset === -1) {
    throw new Error('WAV data chunk not found')
  }

  const end = Math.min(buffer.length, dataOffset + dataSize)
  const audio = buffer.subarray(dataOffset, end)
  return { audio, fmt }
}

const loadAudio = async (inputPath) => {
  const buffer = await fs.readFile(inputPath)
  const ext = path.extname(inputPath).toLowerCase()

  if (ext === '.wav' || ext === '.wave') {
    return parseWav(buffer)
  }

  return { audio: buffer, fmt: null }
}

const formatError = (message) => {
  console.error(message)
  process.exit(1)
}

const main = async () => {
  const { audio, fmt } = await loadAudio(filePath)

  if (!audio || audio.length === 0) {
    formatError('Audio buffer is empty')
  }

  if (fmt) {
    if (fmt.audioFormat !== 1) {
      formatError(`WAV must be PCM (format=1). Got ${fmt.audioFormat}`)
    }
    if (fmt.numChannels !== 1) {
      formatError(`WAV must be mono (1 channel). Got ${fmt.numChannels}`)
    }
    if (fmt.sampleRate !== 24000) {
      formatError(`WAV must be 24kHz. Got ${fmt.sampleRate}`)
    }
    if (fmt.bitsPerSample !== 16) {
      formatError(`WAV must be 16-bit PCM. Got ${fmt.bitsPerSample}`)
    }
  }

  const bytesPerSecond = 24000 * 2
  let chunkBytes = Math.floor((bytesPerSecond * chunkMs) / 1000)
  if (chunkBytes < 2) {
    chunkBytes = 2
  }
  chunkBytes -= chunkBytes % 2

  const url = `wss://api.openai.com/v1/realtime?model=${realtimeModel}`
  console.log(`Connecting: ${url}`)
  console.log(`Audio bytes: ${audio.length}, chunkBytes: ${chunkBytes}`)

  const ws = new WebSocket(url, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
  })

  let sentAllAudio = false
  let closeScheduled = false

  const scheduleClose = () => {
    if (closeScheduled) return
    closeScheduled = true
    setTimeout(() => ws.close(), 2000)
  }

  ws.on('message', (data) => {
    const text = data.toString()
    let event
    try {
      event = JSON.parse(text)
    } catch (error) {
      console.error('Failed to parse message', error)
      return
    }

    if (logRaw) {
      console.log('Event:', event)
      return
    }

    if (event.type === 'session.created') {
      console.log('[event] session.created')
      return
    }

    if (event.type === 'session.updated') {
      console.log('[event] session.updated confirmed')
      return
    }

    if (event.type === 'error') {
      console.error('Server error:', event.error)
      scheduleClose()
      return
    }

    if (event.type) {
      console.log(`[event] ${event.type}`)
      return
    }

    console.log('[event] unknown payload')
  })

  ws.on('open', async () => {
    console.log('WebSocket open')

    const sessionUpdate = {
      type: 'session.update',
      session: {
        type: 'realtime',
      },
    }

    ws.send(JSON.stringify(sessionUpdate))
    console.log('Sent session.update (basic realtime)')

    await sleep(500)

    console.log(`Sending audio (${audio.length} bytes) in chunks of ${chunkBytes}...`)
    let bytesSent = 0
    for (let offset = 0; offset < audio.length; offset += chunkBytes) {
      const chunk = audio.subarray(offset, Math.min(audio.length, offset + chunkBytes))
      ws.send(
        JSON.stringify({
          type: 'input_audio_buffer.append',
          audio: chunk.toString('base64'),
        })
      )
      bytesSent += chunk.length
      if (chunkMs > 0) {
        await sleep(chunkMs)
      }
    }

    console.log(`Sent ${bytesSent} bytes of audio`)
    sentAllAudio = true

    setTimeout(() => scheduleClose(), 3000)
  })

  ws.on('close', (code, reason) => {
    console.log(`WebSocket closed: ${code} ${reason.toString()}`)
  })

  ws.on('error', (error) => {
    console.error('WebSocket error:', error)
  })
}

main().catch((error) => {
  console.error('Fatal:', error)
  process.exit(1)
})
