import { NextResponse } from "next/server";
import { listAllModels } from "@/server/opencode/models-store";
import type { OpencodeModelsListResponse } from "@/types/ipc";

export async function GET() {
	try {
		const models = listAllModels() as OpencodeModelsListResponse["models"];
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
			error instanceof Error ? error.message : "Failed to list OpenCode models";
		return NextResponse.json(
			{ success: false, error: message },
			{ status: 500 },
		);
	}
}
