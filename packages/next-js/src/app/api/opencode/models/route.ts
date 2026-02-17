import { NextResponse } from "next/server";
import { listAllModels } from "@/server/opencode/models-store";

export async function GET() {
	try {
		const models = listAllModels();
		return NextResponse.json({ success: true, data: { models } });
	} catch (error) {
		if (
			error instanceof Error &&
			error.message.toLowerCase().includes("no such table")
		) {
			return NextResponse.json({ success: true, data: { models: [] } });
		}

		const message =
			error instanceof Error ? error.message : "Failed to list OpenCode models";
		return NextResponse.json(
			{ success: false, error: message },
			{ status: 500 },
		);
	}
}
