import { describe, expect, it } from "vitest";
import { applyTopLevelConfigChange } from "./OpencodeConfigSettings";

describe("applyTopLevelConfigChange", () => {
	it("updates key when value is provided", () => {
		expect(
			applyTopLevelConfigChange({ a: 1, mcp: { server: true } }, "a", 2),
		).toEqual({ a: 2, mcp: { server: true } });
	});

	it("removes key completely when value is undefined", () => {
		expect(
			applyTopLevelConfigChange(
				{ a: 1, mcp: { server: true } },
				"mcp",
				undefined,
			),
		).toEqual({ a: 1 });
	});
});
