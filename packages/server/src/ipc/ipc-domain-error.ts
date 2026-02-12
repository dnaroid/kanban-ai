import { ErrorCode } from "../../shared/src/ipc'

export class IpcDomainError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
    public readonly details?: unknown
  ) {
    super(message)
    this.name = 'IpcDomainError'
  }
}

export const ipcError = (code: ErrorCode, message: string, details?: unknown): IpcDomainError => {
  return new IpcDomainError(code, message, details)
}

export const isIpcDomainError = (value: unknown): value is IpcDomainError => {
  return value instanceof IpcDomainError
}
