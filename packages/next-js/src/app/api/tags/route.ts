import { NextResponse } from "next/server";
import { dbManager } from "@/server/db";
import { randomUUID } from "crypto";

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

export async function POST(request: Request) {
	try {
		const body = (await request.json()) as {
			name?: string;
			color?: string;
		};

		const name = body.name?.trim();
		const color = body.color?.trim();

		if (!name || !color) {
			return NextResponse.json(
				{ success: false, error: "name and color are required" },
				{ status: 400 },
			);
		}

		const db = dbManager.connect();
		const now = new Date().toISOString();
		const id = randomUUID();

		const stmt = db.prepare(`
			INSERT INTO tags (id, name, color, created_at, updated_at)
			VALUES (?, ?, ?, ?, ?)
		`);

		stmt.run(id, name, color, now, now);

		const created = db
			.prepare(
				`SELECT id, name, color, created_at as createdAt, updated_at as updatedAt FROM tags WHERE id = ?`,
			)
			.get(id);

		return NextResponse.json({ success: true, data: created });
	} catch (error) {
		if (
			error instanceof Error &&
			error.message.toLowerCase().includes("unique")
		) {
			return NextResponse.json(
				{ success: false, error: "Tag name already exists" },
				{ status: 409 },
			);
		}

		console.error("[API] Error creating tag:", error);
		return NextResponse.json(
			{ success: false, error: "Failed to create tag" },
			{ status: 500 },
		);
	}
}
