import * as ipcErrors from '../../../shared/dist/ipc/errors'
import { ok, fail, Result, unwrap } from '../../../shared/dist/ipc/result'
import type { Result } from '../../../shared/dist/ipc/result'
import type { ErrorCode as IpcErrorCode } from '../../../shared/dist/ipc/errors'

const ErrorCode = (() => {
  const moduleShape = ipcErrors as unknown as {
    ErrorCode?: { INTERNAL_ERROR?: string }
    default?: { ErrorCode?: { INTERNAL_ERROR?: string } }
  }

  return (
    moduleShape.ErrorCode ?? moduleShape.default?.ErrorCode ?? { INTERNAL_ERROR: 'INTERNAL_ERROR' }
  )
})()

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
      (ErrorCode.INTERNAL_ERROR ?? 'INTERNAL_ERROR') as IpcErrorCode,
      `Transaction failed: ${error instanceof Error ? error.message : String(error)}`
    )
  }
}
