import { describe, expect, it } from "vitest";
import { canRemoveObjectProperty, validateSchema } from "./DynamicFormFields";
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
