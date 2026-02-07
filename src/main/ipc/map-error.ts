import { ErrorCode, fail, type Result } from '../../shared/ipc'
import { isIpcDomainError } from './ipc-domain-error'

export const toResultError = <T = never>(error: unknown): Result<T> => {
  if (isIpcDomainError(error)) {
    return fail(error.code, error.message, error.details)
  }

  if (error instanceof Error) {
    const code = mapErrorToCode(error)
    return fail(code, error.message)
  }

  if (typeof error === 'string') {
    return fail(ErrorCode.UNKNOWN, error)
  }

  return fail(ErrorCode.UNKNOWN, 'An unknown error occurred')
}

const mapErrorToCode = (error: Error): ErrorCode => {
  const message = error.message.toLowerCase()

  if (message.includes('not found')) {
    return ErrorCode.NOT_FOUND
  }

  if (message.includes('already exists')) {
    return ErrorCode.ALREADY_EXISTS
  }

  if (message.includes('validation') || message.includes('invalid')) {
    return ErrorCode.VALIDATION_ERROR
  }

  if (message.includes('permission') || message.includes('access denied')) {
    return ErrorCode.FS_PERMISSION_DENIED
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
