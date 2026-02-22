import { NextResponse } from "next/server";
import { dbManager } from "@/server/db";
import type { OpencodeModelsListResponse } from "@/types/ipc";

export async function GET() {
	try {
		const db = dbManager.connect();
		const models = db
			.prepare(
				`SELECT name, enabled, difficulty, COALESCE(variants, '') as variants FROM opencode_models WHERE enabled = 1 ORDER BY name ASC`,
			)
			.all() as OpencodeModelsListResponse["models"];

		return NextResponse.json({ success: true, data: { models } });
	} catch (error) {
		if (
			error instanceof Error &&
			error.message.toLowerCase().includes("no such table")
		) {
			return NextResponse.json({
				success: true,
				data: { models: [] as OpencodeModelsListResponse["models"] },
			});
		}

		const message =
			error instanceof Error
				? error.message
				: "Failed to list enabled OpenCode models";
		return NextResponse.json(
			{ success: false, error: message },
			{ status: 500 },
		);
	}
}
