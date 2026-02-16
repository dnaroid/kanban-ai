import { NextResponse } from "next/server";
import { runService } from "@/server/run/run-service";
import type { Run } from "@/types/ipc";

export async function GET(request: Request): Promise<Response> {
	try {
		const { searchParams } = new URL(request.url);
		const taskId = searchParams.get("taskId")?.trim();

		if (!taskId) {
			return NextResponse.json(
				{ success: false, error: "taskId query parameter is required" },
				{ status: 400 },
			);
		}

		const runs = runService.listByTask(taskId);
		const data: { runs: Run[] } = { runs };
		return NextResponse.json({ success: true, data });
	} catch (error) {
		const message =
			error instanceof Error ? error.message : "Failed to list runs";
		return NextResponse.json(
			{ success: false, error: message },
			{ status: 500 },
		);
	}
}
