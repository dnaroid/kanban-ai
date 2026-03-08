import { describe, expect, it } from "vitest";
import {
	normalizeOptionalRoleId,
	normalizeQuickRunPrompt,
	normalizeQuickRunRawStoryInput,
} from "./use-board-model";

describe("normalizeQuickRunPrompt", () => {
	it("returns trimmed prompt text", () => {
		expect(normalizeQuickRunPrompt("  ship it  ")).toBe("ship it");
	});

	it("returns empty string for missing prompt", () => {
		expect(normalizeQuickRunPrompt(undefined)).toBe("");
		expect(normalizeQuickRunPrompt(null)).toBe("");
	});
});

describe("normalizeOptionalRoleId", () => {
	it("returns trimmed role id for non-empty strings", () => {
		expect(normalizeOptionalRoleId("  role-dev  ")).toBe("role-dev");
	});

	it("returns null for missing or blank role ids", () => {
		expect(normalizeOptionalRoleId(undefined)).toBeNull();
		expect(normalizeOptionalRoleId(null)).toBeNull();
		expect(normalizeOptionalRoleId("   ")).toBeNull();
	});

	it("returns null for non-string role ids", () => {
		expect(normalizeOptionalRoleId({ id: "role-dev" })).toBeNull();
		expect(normalizeOptionalRoleId(123)).toBeNull();
	});
});

describe("normalizeQuickRunRawStoryInput", () => {
	it("normalizes prompt and missing role id together for quick-run raw story", () => {
		expect(normalizeQuickRunRawStoryInput(undefined, undefined)).toEqual({
			cleanPrompt: "",
			preferredRoleId: null,
		});
	});

	it("keeps trimmed values when both prompt and role id are present", () => {
		expect(
			normalizeQuickRunRawStoryInput("  raw story  ", "  role-dev  "),
		).toEqual({
			cleanPrompt: "raw story",
			preferredRoleId: "role-dev",
		});
	});
});
