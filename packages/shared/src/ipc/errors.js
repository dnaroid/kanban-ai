"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.isServerError = exports.isClientError = exports.toErrorMessage = exports.ErrorCode = void 0;
var ErrorCode;
(function (ErrorCode) {
    // Generic errors
    ErrorCode["UNKNOWN"] = "UNKNOWN";
    ErrorCode["VALIDATION_ERROR"] = "VALIDATION_ERROR";
    ErrorCode["NOT_FOUND"] = "NOT_FOUND";
    ErrorCode["ALREADY_EXISTS"] = "ALREADY_EXISTS";
    ErrorCode["INTERNAL_ERROR"] = "INTERNAL_ERROR";
    ErrorCode["UNAUTHORIZED"] = "UNAUTHORIZED";
    ErrorCode["FORBIDDEN"] = "FORBIDDEN";
    // Project errors
    ErrorCode["PROJECT_NOT_FOUND"] = "PROJECT_NOT_FOUND";
    ErrorCode["PROJECT_PATH_INVALID"] = "PROJECT_PATH_INVALID";
    ErrorCode["PROJECT_PATH_NOT_ACCESSIBLE"] = "PROJECT_PATH_NOT_ACCESSIBLE";
    ErrorCode["PROJECT_ALREADY_EXISTS"] = "PROJECT_ALREADY_EXISTS";
    ErrorCode["PROJECT_DELETE_FAILED"] = "PROJECT_DELETE_FAILED";
    // Task errors
    ErrorCode["TASK_NOT_FOUND"] = "TASK_NOT_FOUND";
    ErrorCode["TASK_MOVE_INVALID"] = "TASK_MOVE_INVALID";
    ErrorCode["TASK_UPDATE_FAILED"] = "TASK_UPDATE_FAILED";
    ErrorCode["TASK_DELETE_FAILED"] = "TASK_DELETE_FAILED";
    ErrorCode["TASK_LOCKED"] = "TASK_LOCKED";
    // Column errors
    ErrorCode["COLUMN_NOT_FOUND"] = "COLUMN_NOT_FOUND";
    ErrorCode["COLUMN_INVALID"] = "COLUMN_INVALID";
    // Run errors
    ErrorCode["RUN_NOT_FOUND"] = "RUN_NOT_FOUND";
    ErrorCode["RUN_ALREADY_RUNNING"] = "RUN_ALREADY_RUNNING";
    ErrorCode["RUN_CANCEL_FAILED"] = "RUN_CANCEL_FAILED";
    ErrorCode["RUN_START_FAILED"] = "RUN_START_FAILED";
    ErrorCode["RUN_DELETE_FAILED"] = "RUN_DELETE_FAILED";
    ErrorCode["RUN_INVALID_STATE"] = "RUN_INVALID_STATE";
    // OpenCode errors
    ErrorCode["OPENCODE_UNAVAILABLE"] = "OPENCODE_UNAVAILABLE";
    ErrorCode["OPENCODE_SESSION_NOT_FOUND"] = "OPENCODE_SESSION_NOT_FOUND";
    ErrorCode["OPENCODE_TIMEOUT"] = "OPENCODE_TIMEOUT";
    ErrorCode["OPENCODE_CONNECTION_FAILED"] = "OPENCODE_CONNECTION_FAILED";
    ErrorCode["OPENCODE_INVALID_RESPONSE"] = "OPENCODE_INVALID_RESPONSE";
    ErrorCode["OPENCODE_MODEL_NOT_FOUND"] = "OPENCODE_MODEL_NOT_FOUND";
    // Database errors
    ErrorCode["DB_CONNECTION_FAILED"] = "DB_CONNECTION_FAILED";
    ErrorCode["DB_QUERY_FAILED"] = "DB_QUERY_FAILED";
    ErrorCode["DB_TRANSACTION_FAILED"] = "DB_TRANSACTION_FAILED";
    ErrorCode["DB_MIGRATION_FAILED"] = "DB_MIGRATION_FAILED";
    // File system errors
    ErrorCode["FS_READ_FAILED"] = "FS_READ_FAILED";
    ErrorCode["FS_WRITE_FAILED"] = "FS_WRITE_FAILED";
    ErrorCode["FS_DELETE_FAILED"] = "FS_DELETE_FAILED";
    ErrorCode["FS_PATH_NOT_FOUND"] = "FS_PATH_NOT_FOUND";
    ErrorCode["FS_PERMISSION_DENIED"] = "FS_PERMISSION_DENIED";
})(ErrorCode || (exports.ErrorCode = ErrorCode = {}));
/**
 * Map error codes to human-readable messages
 * These are default messages - can be overridden with i18n
 */
var toErrorMessage = function (code) {
    var _a;
    var messages = (_a = {},
        // Generic
        _a[ErrorCode.UNKNOWN] = 'An unknown error occurred',
        _a[ErrorCode.VALIDATION_ERROR] = 'Validation failed',
        _a[ErrorCode.NOT_FOUND] = 'Resource not found',
        _a[ErrorCode.ALREADY_EXISTS] = 'Resource already exists',
        _a[ErrorCode.INTERNAL_ERROR] = 'Internal server error',
        _a[ErrorCode.UNAUTHORIZED] = 'Unauthorized access',
        _a[ErrorCode.FORBIDDEN] = 'Access forbidden',
        // Project
        _a[ErrorCode.PROJECT_NOT_FOUND] = 'Project not found',
        _a[ErrorCode.PROJECT_PATH_INVALID] = 'Invalid project path',
        _a[ErrorCode.PROJECT_PATH_NOT_ACCESSIBLE] = 'Project path is not accessible',
        _a[ErrorCode.PROJECT_ALREADY_EXISTS] = 'Project already exists',
        _a[ErrorCode.PROJECT_DELETE_FAILED] = 'Failed to delete project',
        // Task
        _a[ErrorCode.TASK_NOT_FOUND] = 'Task not found',
        _a[ErrorCode.TASK_MOVE_INVALID] = 'Invalid task move operation',
        _a[ErrorCode.TASK_UPDATE_FAILED] = 'Failed to update task',
        _a[ErrorCode.TASK_DELETE_FAILED] = 'Failed to delete task',
        _a[ErrorCode.TASK_LOCKED] = 'Task is locked by an active run',
        // Column
        _a[ErrorCode.COLUMN_NOT_FOUND] = 'Column not found',
        _a[ErrorCode.COLUMN_INVALID] = 'Invalid column',
        // Run
        _a[ErrorCode.RUN_NOT_FOUND] = 'Run not found',
        _a[ErrorCode.RUN_ALREADY_RUNNING] = 'A run is already in progress for this task',
        _a[ErrorCode.RUN_CANCEL_FAILED] = 'Failed to cancel run',
        _a[ErrorCode.RUN_START_FAILED] = 'Failed to start run',
        _a[ErrorCode.RUN_DELETE_FAILED] = 'Failed to delete run',
        _a[ErrorCode.RUN_INVALID_STATE] = 'Run is in an invalid state for this operation',
        // OpenCode
        _a[ErrorCode.OPENCODE_UNAVAILABLE] = 'OpenCode service is unavailable',
        _a[ErrorCode.OPENCODE_SESSION_NOT_FOUND] = 'OpenCode session not found',
        _a[ErrorCode.OPENCODE_TIMEOUT] = 'OpenCode request timed out',
        _a[ErrorCode.OPENCODE_CONNECTION_FAILED] = 'Failed to connect to OpenCode',
        _a[ErrorCode.OPENCODE_INVALID_RESPONSE] = 'Invalid response from OpenCode',
        _a[ErrorCode.OPENCODE_MODEL_NOT_FOUND] = 'OpenCode model not found',
        // Database
        _a[ErrorCode.DB_CONNECTION_FAILED] = 'Database connection failed',
        _a[ErrorCode.DB_QUERY_FAILED] = 'Database query failed',
        _a[ErrorCode.DB_TRANSACTION_FAILED] = 'Database transaction failed',
        _a[ErrorCode.DB_MIGRATION_FAILED] = 'Database migration failed',
        // File system
        _a[ErrorCode.FS_READ_FAILED] = 'Failed to read file',
        _a[ErrorCode.FS_WRITE_FAILED] = 'Failed to write file',
        _a[ErrorCode.FS_DELETE_FAILED] = 'Failed to delete file',
        _a[ErrorCode.FS_PATH_NOT_FOUND] = 'Path not found',
        _a[ErrorCode.FS_PERMISSION_DENIED] = 'Permission denied',
        _a);
    return messages[code] || messages[ErrorCode.UNKNOWN];
};
exports.toErrorMessage = toErrorMessage;
/**
 * Check if an error code is a client error (4xx equivalent)
 */
var isClientError = function (code) {
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
    ].includes(code);
};
exports.isClientError = isClientError;
/**
 * Check if an error code is a server error (5xx equivalent)
 */
var isServerError = function (code) {
    return [
        ErrorCode.INTERNAL_ERROR,
        ErrorCode.DB_CONNECTION_FAILED,
        ErrorCode.DB_QUERY_FAILED,
        ErrorCode.DB_TRANSACTION_FAILED,
        ErrorCode.OPENCODE_UNAVAILABLE,
        ErrorCode.OPENCODE_CONNECTION_FAILED,
    ].includes(code);
};
exports.isServerError = isServerError;
