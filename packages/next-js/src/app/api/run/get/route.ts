import { NextResponse } from "next/server";
import type { Run } from "@/types/ipc";
import { runService } from "@/server/run/run-service";

export async function GET(request: Request): Promise<Response> {
	try {
		const { searchParams } = new URL(request.url);
		const runId = searchParams.get("runId")?.trim();

		if (!runId) {
			return NextResponse.json(
				{ success: false, error: "runId query parameter is required" },
				{ status: 400 },
			);
		}

		const run = runService.get(runId);
		const data: { run: Run | null } = { run };
		return NextResponse.json({ success: true, data });
	} catch (error) {
		const message =
			error instanceof Error ? error.message : "Failed to get run";
		return NextResponse.json(
			{ success: false, error: message },
			{ status: 500 },
		);
	}
}
