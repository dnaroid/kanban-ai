import { describe, expect, it } from "vitest";
import { ErrorCode } from "@shared/ipc";
import { toResultError } from "../../ipc/map-error";

describe("toResultError", () => {
	it("maps unique constraint errors to ALREADY_EXISTS", () => {
		const result = toResultError(
			new Error("SQLITE_CONSTRAINT_UNIQUE: users.email"),
		);

		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error.code).toBe(ErrorCode.ALREADY_EXISTS);
		}
	});

	it("maps database locked errors to DB_TRANSACTION_FAILED", () => {
		const result = toResultError(new Error("SQLITE_BUSY: database is locked"));

		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error.code).toBe(ErrorCode.DB_TRANSACTION_FAILED);
		}
	});
});
