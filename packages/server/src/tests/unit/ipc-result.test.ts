import { describe, expect, it } from 'vitest'
import { ErrorCode } from '../../shared/ipc'
import type { Result } from '../../shared/ipc'
import { unwrapIpcResult } from '../../lib/ipc-result'

describe('unwrapIpcResult', () => {
  it('returns data when result is ok', () => {
    const result: Result<{ value: number }> = { ok: true, data: { value: 42 } }

    expect(unwrapIpcResult(result)).toEqual({ value: 42 })
  })

  it('throws readable error when result is failure', () => {
    const result: Result<never> = {
      ok: false,
      error: {
        code: ErrorCode.INTERNAL_ERROR,
        message: 'Something failed',
      },
    }

    expect(() => unwrapIpcResult(result)).toThrow('[INTERNAL_ERROR] Something failed')
  })
})
