import { ErrorCode, fail, type Result } from '../../shared/ipc'
import { appError, type AppError } from '../../shared/errors'
import { isIpcDomainError } from './ipc-domain-error'

export const toAppError = (error: unknown): AppError => {
  if (isIpcDomainError(error)) {
    return appError(error.code, error.message, error.details)
  }

  if (error instanceof Error) {
    const code = mapErrorToCode(error)
    return appError(code, error.message, undefined, error)
  }

  if (typeof error === 'string') {
    return appError(ErrorCode.UNKNOWN, error)
  }

  return appError(ErrorCode.UNKNOWN, 'An unknown error occurred')
}

export const toResultError = <T = never>(error: unknown): Result<T> => {
  const normalized = toAppError(error)
  return fail(normalized.code, normalized.message, normalized.details)
}

const mapErrorToCode = (error: Error): ErrorCode => {
  const message = error.message.toLowerCase()

  if (message.includes('not found')) {
    return ErrorCode.NOT_FOUND
  }

  if (message.includes('already exists')) {
    return ErrorCode.ALREADY_EXISTS
  }

  if (message.includes('unique constraint') || message.includes('sqlite_constraint_unique')) {
    return ErrorCode.ALREADY_EXISTS
  }

  if (
    message.includes('foreign key constraint') ||
    message.includes('sqlite_constraint_foreignkey')
  ) {
    return ErrorCode.VALIDATION_ERROR
  }

  if (message.includes('validation') || message.includes('invalid')) {
    return ErrorCode.VALIDATION_ERROR
  }

  if (message.includes('permission') || message.includes('access denied')) {
    return ErrorCode.FS_PERMISSION_DENIED
  }

  if (message.includes('sqlite_busy') || message.includes('database is locked')) {
    return ErrorCode.DB_TRANSACTION_FAILED
  }

  if (message.includes('database') || message.includes('sqlite')) {
    return ErrorCode.DB_QUERY_FAILED
  }

  if (message.includes('timeout')) {
    return ErrorCode.OPENCODE_TIMEOUT
  }

  if (message.includes('connection')) {
    return ErrorCode.OPENCODE_CONNECTION_FAILED
  }

  return ErrorCode.INTERNAL_ERROR
}

export const wrapAsync = <TInput, TOutput>(fn: (input: TInput) => Promise<TOutput>) => {
  return async (input: TInput): Promise<Result<TOutput>> => {
    try {
      const result = await fn(input)
      return { ok: true, data: result }
    } catch (error) {
      return toResultError(error)
    }
  }
}

export const wrapSync = <TInput, TOutput>(fn: (input: TInput) => TOutput) => {
  return (input: TInput): Result<TOutput> => {
    try {
      const result = fn(input)
      return { ok: true, data: result }
    } catch (error) {
      return toResultError(error)
    }
  }
}
