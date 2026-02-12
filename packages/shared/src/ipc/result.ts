/**
 * Result type for error handling without exceptions
 *
 * @example
 * ```ts
 * function divide(a: number, b: number): Result<number> {
 *   if (b === 0) {
 *     return fail(ErrorCode.VALIDATION_ERROR, 'Division by zero')
 *   }
 *   return ok(a / b)
 * }
 * ```
 */

import type { ErrorCode } from './errors'

export type Result<T, E = ErrorCode> =
  | { ok: true; data: T }
  | { ok: false; error: { code: E; message: string; details?: unknown } }

/**
 * Create a successful result
 */
export const ok = <T>(data: T): Result<T> => ({ ok: true, data })

/**
 * Create a failed result
 */
export const fail = <E = ErrorCode>(
  code: E,
  message: string,
  details?: unknown
): Result<never, E> => ({
  ok: false,
  error: { code, message, details },
})

/**
 * Unwrap a result, throwing if it's an error
 * Use only when you're certain the result is ok
 */
export const unwrap = <T>(result: Result<T>): T => {
  if (!result.ok) {
    throw new Error(result.error.message)
  }
  return result.data
}

/**
 * Map a successful result to a new value
 */
export const map = <T, U>(result: Result<T>, fn: (data: T) => U): Result<U> => {
  if (!result.ok) return result
  return ok(fn(result.data))
}

/**
 * Chain results together (flatMap)
 */
export const andThen = <T, U>(result: Result<T>, fn: (data: T) => Result<U>): Result<U> => {
  if (!result.ok) return result
  return fn(result.data)
}

/**
 * Get the value or a default
 */
export const getOrElse = <T>(result: Result<T>, defaultValue: T): T => {
  return result.ok ? result.data : defaultValue
}

/**
 * Check if result is ok
 */
export const isOk = <T>(result: Result<T>): result is { ok: true; data: T } => {
  return result.ok
}

/**
 * Check if result is error
 */
export const isError = <T>(
  result: Result<T>
): result is { ok: false; error: { code: ErrorCode; message: string; details?: unknown } } => {
  return !result.ok
}
