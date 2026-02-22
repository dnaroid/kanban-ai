import { NextResponse } from "next/server";
import { runService } from "@/server/run/run-service";

interface DeleteRunBody {
	runId?: unknown;
}

export async function POST(request: Request): Promise<Response> {
	try {
		const body = (await request.json()) as DeleteRunBody;
		const runId = typeof body.runId === "string" ? body.runId.trim() : "";

		if (!runId) {
			return NextResponse.json(
				{ success: false, error: "runId is required" },
				{ status: 400 },
			);
		}

		await runService.delete(runId);
		return NextResponse.json({ success: true, data: { success: true } });
	} catch (error) {
		const message =
			error instanceof Error ? error.message : "Failed to delete run";
		return NextResponse.json(
			{ success: false, error: message },
			{ status: 500 },
		);
	}
}
