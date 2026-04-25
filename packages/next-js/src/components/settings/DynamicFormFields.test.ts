import { act, createElement } from "react";
import { createRoot, Root } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import {
	canRemoveObjectProperty,
	DynamicFormFields,
	validateSchema,
} from "./DynamicFormFields";
import type { JSONSchema } from "@/lib/json-schema-types";

describe("canRemoveObjectProperty", () => {
	it("allows removing optional keys when minProperties is respected", () => {
		const schema: JSONSchema = {
			type: "object",
			required: ["requiredKey"],
			minProperties: 1,
		};

		const value = {
			requiredKey: true,
			optionalObject: { nested: "value" },
		};

		expect(canRemoveObjectProperty(schema, value, "optionalObject")).toBe(true);
	});

	it("does not allow removing required keys", () => {
		const schema: JSONSchema = {
			type: "object",
			required: ["config"],
		};

		const value = {
			config: { enabled: true },
			other: "x",
		};

		expect(canRemoveObjectProperty(schema, value, "config")).toBe(false);
	});

	it("does not allow removing keys that would violate minProperties", () => {
		const schema: JSONSchema = {
			type: "object",
			minProperties: 2,
		};

		const value = {
			first: { enabled: true },
			second: { enabled: false },
		};

		expect(canRemoveObjectProperty(schema, value, "first")).toBe(false);
	});

	it("does not allow removing missing keys", () => {
		const schema: JSONSchema = {
			type: "object",
		};

		const value = {
			a: 1,
		};

		expect(canRemoveObjectProperty(schema, value, "missing")).toBe(false);
	});
});

describe("validateSchema", () => {
	it("returns no errors for valid payload", () => {
		const schema: JSONSchema = {
			type: "object",
			properties: {
				name: { type: "string" },
			},
			required: ["name"],
			additionalProperties: false,
		};

		expect(validateSchema(schema, { name: "opencode" })).toEqual([]);
	});

	it("returns contextual message for missing required property", () => {
		const schema: JSONSchema = {
			type: "object",
			properties: {
				name: { type: "string" },
			},
			required: ["name"],
		};

		const errors = validateSchema(schema, {});

		expect(errors).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					keyword: "required",
					message: 'Missing required property "name"',
				}),
			]),
		);
	});

	it("returns contextual message for additionalProperties violations", () => {
		const schema: JSONSchema = {
			type: "object",
			properties: {
				name: { type: "string" },
			},
			additionalProperties: false,
		};

		const errors = validateSchema(schema, { name: "ok", extra: true });

		expect(errors).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					keyword: "additionalProperties",
					message: 'Unknown property "extra" is not allowed',
				}),
			]),
		);
	});

	it("returns exception error when schema itself is invalid", () => {
		const invalidSchema = {
			type: "object",
			required: "name",
		} as unknown as JSONSchema;

		const errors = validateSchema(invalidSchema, { name: "x" });

		expect(errors).toHaveLength(1);
		expect(errors[0]).toEqual(
			expect.objectContaining({
				path: "/",
				keyword: "exception",
			}),
		);
		expect(errors[0]?.message).toContain("Schema validation error:");
	});
});

describe("mcp dynamic key removal (anyOf schema)", () => {
	it("shows remove action and removes context7 from mcp", () => {
		(
			globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
		).IS_REACT_ACT_ENVIRONMENT = true;

		const schema: JSONSchema = {
			type: "object",
			properties: {
				mcp: {
					type: "object",
					additionalProperties: {
						anyOf: [
							{
								anyOf: [
									{
										type: "object",
										properties: {
											type: { type: "string", const: "remote" },
											url: { type: "string" },
											enabled: { type: "boolean" },
										},
										required: ["type", "url"],
										additionalProperties: false,
									},
								],
							},
							{
								type: "object",
								properties: {
									enabled: { type: "boolean" },
								},
								required: ["enabled"],
								additionalProperties: false,
							},
						],
					},
				},
			},
		};

		const data = {
			mcp: {
				context7: {
					enabled: true,
					type: "remote",
					url: "https://mcp.context7.com/mcp",
				},
				"web-search-tavily": {
					enabled: true,
					type: "remote",
					url: "https://mcp.tavily.com/mcp",
				},
			},
		};

		const onChange = vi.fn();
		const container = document.createElement("div");
		document.body.appendChild(container);
		const root: Root = createRoot(container);

		try {
			act(() => {
				root.render(
					createElement(DynamicFormFields, { schema, data, onChange }),
				);
			});

			const mcpToggle = Array.from(container.querySelectorAll("button")).find(
				(btn) => btn.textContent?.includes("mcp"),
			);
			expect(mcpToggle).toBeTruthy();

			act(() => {
				mcpToggle?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
			});

			const removeButtons = Array.from(
				container.querySelectorAll('button[title="Remove"]'),
			);
			expect(removeButtons.length).toBeGreaterThan(0);

			act(() => {
				removeButtons[0]?.dispatchEvent(
					new MouseEvent("click", { bubbles: true }),
				);
			});

			expect(onChange).toHaveBeenCalledWith("mcp", {
				"web-search-tavily": {
					enabled: true,
					type: "remote",
					url: "https://mcp.tavily.com/mcp",
				},
			});
		} finally {
			act(() => {
				root.unmount();
			});
			document.body.removeChild(container);
		}
	});
});
