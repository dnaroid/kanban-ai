import * as ipcErrors from '../../../shared/dist/ipc/errors'
import { ok, fail, Result, unwrap } from '../../../shared/dist/ipc/result'
import * as sharedErrors from '../../../shared/dist/errors'
import type { AppError } from '../../../shared/dist/errors'
import { isIpcDomainError } from './ipc-domain-error'

const resolveAppError = () => {
  const moduleShape = sharedErrors as unknown as {
    appError?: (
      code: AppError['code'],
      message: string,
      details?: unknown,
      cause?: unknown
    ) => AppError
    default?: {
      appError?: (
        code: AppError['code'],
        message: string,
        details?: unknown,
        cause?: unknown
      ) => AppError
    }
  }

  return (
    moduleShape.appError ??
    moduleShape.default?.appError ??
    ((code: AppError['code'], message: string, details?: unknown, cause?: unknown): AppError => ({
      code,
      message,
      details,
      cause,
    }))
  )
}

const appError = resolveAppError()

// Используем импортированный fail напрямую
const resolveFail = () => fail

type ErrorCodeMap = Record<string, string>

const resolveErrorCode = (): ErrorCodeMap => {
  const moduleShape = ipcErrors as unknown as {
    ErrorCode?: ErrorCodeMap
    default?: { ErrorCode?: ErrorCodeMap }
  }

  return (
    moduleShape.ErrorCode ??
    moduleShape.default?.ErrorCode ?? {
      UNKNOWN: 'UNKNOWN',
      NOT_FOUND: 'NOT_FOUND',
      ALREADY_EXISTS: 'ALREADY_EXISTS',
      VALIDATION_ERROR: 'VALIDATION_ERROR',
      FS_PERMISSION_DENIED: 'FS_PERMISSION_DENIED',
      DB_TRANSACTION_FAILED: 'DB_TRANSACTION_FAILED',
      DB_QUERY_FAILED: 'DB_QUERY_FAILED',
      OPENCODE_TIMEOUT: 'OPENCODE_TIMEOUT',
      OPENCODE_CONNECTION_FAILED: 'OPENCODE_CONNECTION_FAILED',
      INTERNAL_ERROR: 'INTERNAL_ERROR',
    }
  )
}

const ErrorCode = resolveErrorCode()
type IpcErrorCode = string

export const toAppError = (error: unknown): AppError => {
  if (isIpcDomainError(error)) {
    return appError(error.code, error.message, error.details)
  }

  if (error instanceof Error) {
    const code = mapErrorToCode(error)
    return appError(code as AppError['code'], error.message, undefined, error)
  }

  if (typeof error === 'string') {
    return appError(ErrorCode.UNKNOWN as AppError['code'], error)
  }

  return appError(ErrorCode.UNKNOWN as AppError['code'], 'An unknown error occurred')
}

export const toResultError = <T = never>(error: unknown): Result<T> => {
  const normalized = toAppError(error)
  return fail(normalized.code, normalized.message, normalized.details)
}

const mapErrorToCode = (error: Error): IpcErrorCode => {
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
