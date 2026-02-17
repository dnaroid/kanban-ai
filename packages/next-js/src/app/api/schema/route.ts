import { NextRequest, NextResponse } from "next/server";

// Simple in-memory cache for schemas
const schemaCache = new Map<string, { schema: unknown; timestamp: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export async function GET(request: NextRequest) {
	const url = request.nextUrl.searchParams.get("url");

	if (!url) {
		return NextResponse.json(
			{ error: "Missing 'url' parameter" },
			{ status: 400 },
		);
	}

	// Validate URL
	try {
		const parsedUrl = new URL(url);
		if (!["http:", "https:"].includes(parsedUrl.protocol)) {
			return NextResponse.json(
				{ error: "Invalid URL protocol" },
				{ status: 400 },
			);
		}
	} catch {
		return NextResponse.json({ error: "Invalid URL" }, { status: 400 });
	}

	// Check cache
	const cached = schemaCache.get(url);
	if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
		return NextResponse.json({ schema: cached.schema, cached: true });
	}

	// Fetch schema
	try {
		const response = await fetch(url, {
			headers: {
				Accept: "application/json, application/schema+json",
			},
		});

		if (!response.ok) {
			return NextResponse.json(
				{ error: `Failed to fetch schema: ${response.status}` },
				{ status: response.status },
			);
		}

		const schema = await response.json();

		// Cache result
		schemaCache.set(url, { schema, timestamp: Date.now() });

		return NextResponse.json({ schema, cached: false });
	} catch (error) {
		return NextResponse.json(
			{ error: error instanceof Error ? error.message : "Unknown error" },
			{ status: 500 },
		);
	}
}
