import fs from 'fs/promises'
import FormData from 'form-data'
import path from 'path'

const USAGE = `
Usage:
  node scripts/stt-whisper-debug.mjs --file <audio.wav>

Options:
  --api-key <key>              Defaults to OPENAI_API_KEY
  --model <model>               Default: gpt-4o-mini-transcribe
  --language <ru|en>           Default: ru
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

const filePath = readArg('--file', '-f')
const apiKey = readArg('--api-key') ?? process.env.OPENAI_API_KEY
const model = readArg('--model') ?? 'gpt-4o-mini-transcribe'
const language = readArg('--language') ?? 'ru'

if (!filePath) {
  console.error(USAGE)
  process.exit(1)
}

if (!apiKey) {
  console.error('Missing API key. Set OPENAI_API_KEY or pass --api-key.')
  process.exit(1)
}

const main = async () => {
  console.log(`File: ${filePath}`)
  console.log(`Model: ${model}, language: ${language}`)

  const audioBuffer = await fs.readFile(filePath)

  console.log(`Audio size: ${audioBuffer.length} bytes`)
  console.log('Sending to Whisper API...')

  try {
    const formData = new FormData()
    formData.append('file', audioBuffer, path.basename(filePath))
    formData.append('model', model)
    formData.append('language', language)

    const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        ...formData.getHeaders(),
      },
      body: formData.getBuffer(),
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error('API error:', response.status, errorText)
      process.exit(1)
    }

    const data = await response.json()
    console.log('\n✓ Transcription successful!')
    console.log(`\nTranscript:\n${data.text}`)
  } catch (error) {
    console.error('Error:', error)
    process.exit(1)
  }
}

main().catch((error) => {
  console.error('Fatal:', error)
  process.exit(1)
})
