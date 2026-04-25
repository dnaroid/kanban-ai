import Ajv from "ajv";
import Ajv2020 from "ajv/dist/2020";
import { JSONSchema } from "@/lib/json-schema-types";

const ajv = new Ajv({
	allErrors: true,
	strict: false,
	addUsedSchema: false,
});

const ajv2020 = new Ajv2020({
	allErrors: true,
	strict: false,
	addUsedSchema: false,
});

export interface ValidationError {
	path: string;
	message: string;
	keyword: string;
	params?: Record<string, unknown>;
}

export const canRemoveObjectProperty = (
	schema: JSONSchema,
	obj: Record<string, unknown>,
	key: string,
): boolean => {
	if (!Object.prototype.hasOwnProperty.call(obj, key)) {
		return false;
	}

	const requiredKeys = new Set(
		Array.isArray(schema.required) ? schema.required : [],
	);
	const minProperties =
		typeof schema.minProperties === "number" ? schema.minProperties : 0;

	return !requiredKeys.has(key) && Object.keys(obj).length > minProperties;
};

export const validateSchema = (
	schema: JSONSchema,
	data: unknown,
): ValidationError[] => {
	try {
		const schemaRef = schema.$schema as string | undefined;
		const is2020 = schemaRef?.includes("2020-12");
		const validator = is2020 ? ajv2020 : ajv;
		const validate = validator.compile(schema);
		const isValid = validate(data);

		if (!isValid && validate.errors) {
			return validate.errors.map((err) => {
				let message = err.message || "Validation error";

				if (
					err.keyword === "additionalProperties" &&
					err.params?.additionalProperty
				) {
					message = `Unknown property "${err.params.additionalProperty}" is not allowed`;
				} else if (err.keyword === "required" && err.params?.missingProperty) {
					message = `Missing required property "${err.params.missingProperty}"`;
				} else if (err.keyword === "enum" && err.params?.allowedValues) {
					message = `Must be one of: ${(err.params.allowedValues as string[]).join(", ")}`;
				}

				return {
					path: err.instancePath || "/",
					message,
					keyword: err.keyword,
					params: err.params as Record<string, unknown>,
				};
			});
		}
		return [];
	} catch (e) {
		const errorMessage = e instanceof Error ? e.message : String(e);
		return [
			{
				path: "/",
				message: `Schema validation error: ${errorMessage}`,
				keyword: "exception",
			},
		];
	}
};
