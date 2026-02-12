const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

export const OPENCODE_STATUS_TOKEN = '__OPENCODE_STATUS__::7f2b3b52-2a7f-4f2a-8d2e-9b6c8b0f2e7a::'

export const OPENCODE_STATUS_VALUES = ['done', 'fail', 'question'] as const

export type OpencodeStatus = (typeof OPENCODE_STATUS_VALUES)[number]

export const OPENCODE_STATUS_REGEX = new RegExp(
  `^${escapeRegex(OPENCODE_STATUS_TOKEN)}(${OPENCODE_STATUS_VALUES.join('|')})$`,
  'i'
)

export const buildOpencodeStatusLine = (status: OpencodeStatus): string =>
  `${OPENCODE_STATUS_TOKEN}${status}`

export function extractOpencodeStatus(text: string): {
  status: OpencodeStatus
  statusLine: string
  statusLineIndex: number
} | null {
  if (!text) return null
  const lines = text.split('\n')
  const statusLineIndex = lines.findIndex((line) => OPENCODE_STATUS_REGEX.test(line.trim()))
  if (statusLineIndex === -1) return null

  const statusLine = lines[statusLineIndex] ?? ''
  const match = statusLine.trim().match(OPENCODE_STATUS_REGEX)
  const status = match?.[1]?.toLowerCase() as OpencodeStatus | undefined
  if (!status) return null

  return { status, statusLine, statusLineIndex }
}
