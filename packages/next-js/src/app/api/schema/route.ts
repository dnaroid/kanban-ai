import { NextRequest, NextResponse } from "next/server";
import $RefParser from "@apidevtools/json-schema-ref-parser";

type CachedSchema = { schema: unknown; timestamp: number };
type SchemaObject = Record<string, unknown>;

function forceAdditionalPropertiesFalse(schema: unknown): unknown {
	if (!schema || typeof schema !== "object") return schema;

	const obj = schema as SchemaObject;

	if (Array.isArray(obj)) {
		return obj.map(forceAdditionalPropertiesFalse);
	}

	const result: SchemaObject = {};
	for (const [key, value] of Object.entries(obj)) {
		result[key] = forceAdditionalPropertiesFalse(value);
	}

	if (obj.type === "object" && !("additionalProperties" in obj)) {
		result.additionalProperties = false;
	}

	return result;
}

const schemaCache = new Map<string, CachedSchema>();
const CACHE_TTL = 5 * 60 * 1000;

export async function GET(request: NextRequest) {
	const url = request.nextUrl.searchParams.get("url");

	if (!url) {
		return NextResponse.json(
			{ error: "Missing 'url' parameter" },
			{ status: 400 },
		);
	}

	try {
		new URL(url);
	} catch {
		return NextResponse.json({ error: "Invalid URL" }, { status: 400 });
	}

	const cached = schemaCache.get(url);
	if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
		return NextResponse.json({ schema: cached.schema, cached: true });
	}

	try {
		const response = await fetch(url, {
			headers: { Accept: "application/json, application/schema+json" },
		});

		if (!response.ok) {
			return NextResponse.json(
				{ error: `Failed to fetch schema: ${response.status}` },
				{ status: response.status },
			);
		}

		const rawSchema = await response.json();

		// Resolve all $ref references to produce a fully dereferenced schema
		const resolvedSchema = await $RefParser.dereference(url, rawSchema, {
			continueOnError: false,
		});

		// Force additionalProperties: false on all objects to detect extra fields
		const schema = forceAdditionalPropertiesFalse(resolvedSchema);

		schemaCache.set(url, { schema, timestamp: Date.now() });
		return NextResponse.json({ schema, cached: false });
	} catch (error) {
		return NextResponse.json(
			{ error: error instanceof Error ? error.message : "Unknown error" },
			{ status: 500 },
		);
	}
}
