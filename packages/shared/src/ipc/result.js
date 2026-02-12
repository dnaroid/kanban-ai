"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.isError = exports.isOk = exports.getOrElse = exports.andThen = exports.map = exports.unwrap = exports.fail = exports.ok = void 0;
/**
 * Create a successful result
 */
var ok = function (data) { return ({ ok: true, data: data }); };
exports.ok = ok;
/**
 * Create a failed result
 */
var fail = function (code, message, details) { return ({
    ok: false,
    error: { code: code, message: message, details: details },
}); };
exports.fail = fail;
/**
 * Unwrap a result, throwing if it's an error
 * Use only when you're certain the result is ok
 */
var unwrap = function (result) {
    if (!result.ok) {
        throw new Error(result.error.message);
    }
    return result.data;
};
exports.unwrap = unwrap;
/**
 * Map a successful result to a new value
 */
var map = function (result, fn) {
    if (!result.ok)
        return result;
    return (0, exports.ok)(fn(result.data));
};
exports.map = map;
/**
 * Chain results together (flatMap)
 */
var andThen = function (result, fn) {
    if (!result.ok)
        return result;
    return fn(result.data);
};
exports.andThen = andThen;
/**
 * Get the value or a default
 */
var getOrElse = function (result, defaultValue) {
    return result.ok ? result.data : defaultValue;
};
exports.getOrElse = getOrElse;
/**
 * Check if result is ok
 */
var isOk = function (result) {
    return result.ok;
};
exports.isOk = isOk;
/**
 * Check if result is error
 */
var isError = function (result) {
    return !result.ok;
};
exports.isError = isError;
