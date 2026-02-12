import * as ipcErrors from '../../../shared/dist/ipc/errors'
import type { ErrorCode as ErrorCodeType } from '../../../shared/dist/ipc/errors'
const { ErrorCode } = ipcErrors
export class IpcDomainError extends Error {
  constructor(
    public readonly code: ErrorCodeType,
    message: string,
    public readonly details?: unknown
  ) {
    super(message)
    this.name = 'IpcDomainError'
  }
}

export const ipcError = (
  code: ErrorCodeType,
  message: string,
  details?: unknown
): IpcDomainError => {
  return new IpcDomainError(code, message, details)
}

export const isIpcDomainError = (value: unknown): value is IpcDomainError => {
  return value instanceof IpcDomainError
}
