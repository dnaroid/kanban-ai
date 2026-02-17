import { NextResponse } from "next/server";
import { dbManager } from "@/server/db";

export async function POST() {
	try {
		dbManager.deleteDatabase();
		dbManager.connect();
		return NextResponse.json({ success: true, data: { ok: true } });
	} catch (error) {
		const message =
			error instanceof Error ? error.message : "Failed to wipe database";
		return NextResponse.json(
			{ success: false, error: message },
			{ status: 500 },
		);
	}
}
