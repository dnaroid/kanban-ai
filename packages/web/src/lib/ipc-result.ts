import type { Result } from '@shared/ipc'

export function unwrapIpcResult<T>(result: Result<T>): T {
  if (result.ok) {
    return result.data
  }

  throw new Error(`[${result.error.code}] ${result.error.message}`)
}
