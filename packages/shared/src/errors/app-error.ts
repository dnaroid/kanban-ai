import type { ErrorCode } from '../ipc'

export interface AppError {
  code: ErrorCode
  message: string
  details?: unknown
  cause?: unknown
}

export const appError = (
  code: ErrorCode,
  message: string,
  details?: unknown,
  cause?: unknown
): AppError => ({
  code,
  message,
  details,
  cause,
})
