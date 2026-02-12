import { describe, it, expect } from 'vitest'
import { OPENCODE_STATUS_TOKEN, extractOpencodeStatus } from './opencode-status'

describe('extractOpencodeStatus', () => {
  it('returns null when no status marker', () => {
    expect(extractOpencodeStatus('hello')).toBeNull()
    expect(extractOpencodeStatus('')).toBeNull()
  })

  it('extracts status from a single marker line', () => {
    const text = `${OPENCODE_STATUS_TOKEN}done`
    expect(extractOpencodeStatus(text)).toMatchObject({
      status: 'done',
      statusLine: text,
      statusLineIndex: 0,
    })
  })

  it('extracts status when marker is surrounded by other lines', () => {
    const text = ['Before', `${OPENCODE_STATUS_TOKEN}question`, 'After'].join('\n')
    expect(extractOpencodeStatus(text)).toMatchObject({
      status: 'question',
      statusLine: `${OPENCODE_STATUS_TOKEN}question`,
      statusLineIndex: 1,
    })
  })

  it('is case-insensitive and trims per-line', () => {
    const text = ['x', `  ${OPENCODE_STATUS_TOKEN}FAIL  `, 'y'].join('\n')
    expect(extractOpencodeStatus(text)).toMatchObject({
      status: 'fail',
      statusLineIndex: 1,
    })
  })
})
