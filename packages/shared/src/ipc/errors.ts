/**
 * Centralized error codes for the application
 *
 * All business logic errors should use these codes instead of throwing generic errors.
 * This enables:
 * - Consistent error handling across IPC boundary
 * - Type-safe error handling in renderer
 * - Internationalization of error messages
 * - Better error tracking and analytics
 */

export enum ErrorCode {
  // Generic errors
  UNKNOWN = 'UNKNOWN',
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  NOT_FOUND = 'NOT_FOUND',
  ALREADY_EXISTS = 'ALREADY_EXISTS',
  INTERNAL_ERROR = 'INTERNAL_ERROR',
  UNAUTHORIZED = 'UNAUTHORIZED',
  FORBIDDEN = 'FORBIDDEN',

  // Project errors
  PROJECT_NOT_FOUND = 'PROJECT_NOT_FOUND',
  PROJECT_PATH_INVALID = 'PROJECT_PATH_INVALID',
  PROJECT_PATH_NOT_ACCESSIBLE = 'PROJECT_PATH_NOT_ACCESSIBLE',
  PROJECT_ALREADY_EXISTS = 'PROJECT_ALREADY_EXISTS',
  PROJECT_DELETE_FAILED = 'PROJECT_DELETE_FAILED',

  // Task errors
  TASK_NOT_FOUND = 'TASK_NOT_FOUND',
  TASK_MOVE_INVALID = 'TASK_MOVE_INVALID',
  TASK_UPDATE_FAILED = 'TASK_UPDATE_FAILED',
  TASK_DELETE_FAILED = 'TASK_DELETE_FAILED',
  TASK_LOCKED = 'TASK_LOCKED',

  // Column errors
  COLUMN_NOT_FOUND = 'COLUMN_NOT_FOUND',
  COLUMN_INVALID = 'COLUMN_INVALID',

  // Run errors
  RUN_NOT_FOUND = 'RUN_NOT_FOUND',
  RUN_ALREADY_RUNNING = 'RUN_ALREADY_RUNNING',
  RUN_CANCEL_FAILED = 'RUN_CANCEL_FAILED',
  RUN_START_FAILED = 'RUN_START_FAILED',
  RUN_DELETE_FAILED = 'RUN_DELETE_FAILED',
  RUN_INVALID_STATE = 'RUN_INVALID_STATE',

  // OpenCode errors
  OPENCODE_UNAVAILABLE = 'OPENCODE_UNAVAILABLE',
  OPENCODE_SESSION_NOT_FOUND = 'OPENCODE_SESSION_NOT_FOUND',
  OPENCODE_TIMEOUT = 'OPENCODE_TIMEOUT',
  OPENCODE_CONNECTION_FAILED = 'OPENCODE_CONNECTION_FAILED',
  OPENCODE_INVALID_RESPONSE = 'OPENCODE_INVALID_RESPONSE',
  OPENCODE_MODEL_NOT_FOUND = 'OPENCODE_MODEL_NOT_FOUND',

  // Database errors
  DB_CONNECTION_FAILED = 'DB_CONNECTION_FAILED',
  DB_QUERY_FAILED = 'DB_QUERY_FAILED',
  DB_TRANSACTION_FAILED = 'DB_TRANSACTION_FAILED',
  DB_MIGRATION_FAILED = 'DB_MIGRATION_FAILED',

  // File system errors
  FS_READ_FAILED = 'FS_READ_FAILED',
  FS_WRITE_FAILED = 'FS_WRITE_FAILED',
  FS_DELETE_FAILED = 'FS_DELETE_FAILED',
  FS_PATH_NOT_FOUND = 'FS_PATH_NOT_FOUND',
  FS_PERMISSION_DENIED = 'FS_PERMISSION_DENIED',
}

/**
 * Map error codes to human-readable messages
 * These are default messages - can be overridden with i18n
 */
export const toErrorMessage = (code: ErrorCode): string => {
  const messages: Record<ErrorCode, string> = {
    // Generic
    [ErrorCode.UNKNOWN]: 'An unknown error occurred',
    [ErrorCode.VALIDATION_ERROR]: 'Validation failed',
    [ErrorCode.NOT_FOUND]: 'Resource not found',
    [ErrorCode.ALREADY_EXISTS]: 'Resource already exists',
    [ErrorCode.INTERNAL_ERROR]: 'Internal server error',
    [ErrorCode.UNAUTHORIZED]: 'Unauthorized access',
    [ErrorCode.FORBIDDEN]: 'Access forbidden',

    // Project
    [ErrorCode.PROJECT_NOT_FOUND]: 'Project not found',
    [ErrorCode.PROJECT_PATH_INVALID]: 'Invalid project path',
    [ErrorCode.PROJECT_PATH_NOT_ACCESSIBLE]: 'Project path is not accessible',
    [ErrorCode.PROJECT_ALREADY_EXISTS]: 'Project already exists',
    [ErrorCode.PROJECT_DELETE_FAILED]: 'Failed to delete project',

    // Task
    [ErrorCode.TASK_NOT_FOUND]: 'Task not found',
    [ErrorCode.TASK_MOVE_INVALID]: 'Invalid task move operation',
    [ErrorCode.TASK_UPDATE_FAILED]: 'Failed to update task',
    [ErrorCode.TASK_DELETE_FAILED]: 'Failed to delete task',
    [ErrorCode.TASK_LOCKED]: 'Task is locked by an active run',

    // Column
    [ErrorCode.COLUMN_NOT_FOUND]: 'Column not found',
    [ErrorCode.COLUMN_INVALID]: 'Invalid column',

    // Run
    [ErrorCode.RUN_NOT_FOUND]: 'Run not found',
    [ErrorCode.RUN_ALREADY_RUNNING]: 'A run is already in progress for this task',
    [ErrorCode.RUN_CANCEL_FAILED]: 'Failed to cancel run',
    [ErrorCode.RUN_START_FAILED]: 'Failed to start run',
    [ErrorCode.RUN_DELETE_FAILED]: 'Failed to delete run',
    [ErrorCode.RUN_INVALID_STATE]: 'Run is in an invalid state for this operation',

    // OpenCode
    [ErrorCode.OPENCODE_UNAVAILABLE]: 'OpenCode service is unavailable',
    [ErrorCode.OPENCODE_SESSION_NOT_FOUND]: 'OpenCode session not found',
    [ErrorCode.OPENCODE_TIMEOUT]: 'OpenCode request timed out',
    [ErrorCode.OPENCODE_CONNECTION_FAILED]: 'Failed to connect to OpenCode',
    [ErrorCode.OPENCODE_INVALID_RESPONSE]: 'Invalid response from OpenCode',
    [ErrorCode.OPENCODE_MODEL_NOT_FOUND]: 'OpenCode model not found',

    // Database
    [ErrorCode.DB_CONNECTION_FAILED]: 'Database connection failed',
    [ErrorCode.DB_QUERY_FAILED]: 'Database query failed',
    [ErrorCode.DB_TRANSACTION_FAILED]: 'Database transaction failed',
    [ErrorCode.DB_MIGRATION_FAILED]: 'Database migration failed',

    // File system
    [ErrorCode.FS_READ_FAILED]: 'Failed to read file',
    [ErrorCode.FS_WRITE_FAILED]: 'Failed to write file',
    [ErrorCode.FS_DELETE_FAILED]: 'Failed to delete file',
    [ErrorCode.FS_PATH_NOT_FOUND]: 'Path not found',
    [ErrorCode.FS_PERMISSION_DENIED]: 'Permission denied',
  }

  return messages[code] || messages[ErrorCode.UNKNOWN]
}

/**
 * Check if an error code is a client error (4xx equivalent)
 */
export const isClientError = (code: ErrorCode): boolean => {
  return [
    ErrorCode.VALIDATION_ERROR,
    ErrorCode.NOT_FOUND,
    ErrorCode.ALREADY_EXISTS,
    ErrorCode.UNAUTHORIZED,
    ErrorCode.FORBIDDEN,
    ErrorCode.PROJECT_NOT_FOUND,
    ErrorCode.PROJECT_PATH_INVALID,
    ErrorCode.TASK_NOT_FOUND,
    ErrorCode.TASK_MOVE_INVALID,
    ErrorCode.COLUMN_NOT_FOUND,
    ErrorCode.RUN_NOT_FOUND,
    ErrorCode.RUN_ALREADY_RUNNING,
    ErrorCode.RUN_INVALID_STATE,
  ].includes(code)
}

/**
 * Check if an error code is a server error (5xx equivalent)
 */
export const isServerError = (code: ErrorCode): boolean => {
  return [
    ErrorCode.INTERNAL_ERROR,
    ErrorCode.DB_CONNECTION_FAILED,
    ErrorCode.DB_QUERY_FAILED,
    ErrorCode.DB_TRANSACTION_FAILED,
    ErrorCode.OPENCODE_UNAVAILABLE,
    ErrorCode.OPENCODE_CONNECTION_FAILED,
  ].includes(code)
}
