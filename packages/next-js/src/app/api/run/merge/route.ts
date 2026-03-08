import { NextResponse } from "next/server";
import { runService } from "@/server/run/run-service";

interface MergeRunBody {
	runId?: unknown;
}

export async function POST(request: Request): Promise<Response> {
	try {
		const body = (await request.json()) as MergeRunBody;
		const runId = typeof body.runId === "string" ? body.runId.trim() : "";

		if (!runId) {
			return NextResponse.json(
				{ success: false, error: "runId is required" },
				{ status: 400 },
			);
		}

		const data = await runService.merge(runId);
		return NextResponse.json({ success: true, data });
	} catch (error) {
		const message =
			error instanceof Error ? error.message : "Failed to merge run changes";
		return NextResponse.json(
			{ success: false, error: message },
			{ status: 500 },
		);
	}
}
