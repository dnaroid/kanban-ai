import { NextResponse } from "next/server";
import { dbManager } from "@/server/db";

// Get all global tags
export async function GET() {
	try {
		const db = dbManager.connect();
		const stmt = db.prepare(`
			SELECT
				id,
				name,
				color,
				created_at as createdAt,
				updated_at as updatedAt
			FROM tags
			ORDER BY name ASC
		`);
		const tags = stmt.all();

		return NextResponse.json({ success: true, data: tags });
	} catch (error) {
		console.error("[API] Error fetching tags:", error);
		return NextResponse.json(
			{ success: false, error: "Failed to fetch tags" },
			{ status: 500 },
		);
	}
}
