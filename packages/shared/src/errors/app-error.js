"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.appError = void 0;
var appError = function (code, message, details, cause) { return ({
    code: code,
    message: message,
    details: details,
    cause: cause,
}); };
exports.appError = appError;
