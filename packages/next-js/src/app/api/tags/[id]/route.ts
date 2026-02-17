import { NextRequest, NextResponse } from "next/server";
import { dbManager } from "@/server/db";

interface RouteParams {
	params: Promise<{ id: string }>;
}

export async function DELETE(_request: NextRequest, { params }: RouteParams) {
	try {
		const { id } = await params;
		const db = dbManager.connect();
		const result = db.prepare("DELETE FROM tags WHERE id = ?").run(id);

		if (result.changes === 0) {
			return NextResponse.json(
				{ success: false, error: "Tag not found" },
				{ status: 404 },
			);
		}

		return NextResponse.json({ success: true, data: { ok: true } });
	} catch (error) {
		console.error("[API] Error deleting tag:", error);
		return NextResponse.json(
			{ success: false, error: "Failed to delete tag" },
			{ status: 500 },
		);
	}
}
