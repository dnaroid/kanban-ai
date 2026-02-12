import * as ipcErrors from '@shared/ipc/errors'
const { ErrorCode } = ipcErrors
import * as ipcResult from '@shared/ipc/result'
import type { Result } from '@shared/ipc/result'
const { fail } = ipcResult
import { dbManager } from './index'

class TransactionAbortError extends Error {
  constructor(public readonly result: Result<never>) {
    super('Transaction aborted')
    this.name = 'TransactionAbortError'
  }
}

export function withTransaction<T>(fn: () => Result<T>): Result<T> {
  const db = dbManager.connect()

  try {
    const txFn = db.transaction(() => {
      const result = fn()

      if (!result.ok) {
        throw new TransactionAbortError(result)
      }

      return result
    })

    return txFn()
  } catch (error) {
    if (error instanceof TransactionAbortError) {
      return error.result as Result<T>
    }
    return fail(
      ErrorCode.INTERNAL_ERROR,
      `Transaction failed: ${error instanceof Error ? error.message : String(error)}`
    )
  }
}
