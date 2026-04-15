import { NextResponse } from "next/server";
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

		const result = await runService.getDiff(runId);

		if (result === null) {
			return NextResponse.json(
				{ success: false, error: "Run not found or diff unavailable" },
				{ status: 404 },
			);
		}

		return NextResponse.json({ success: true, data: result });
	} catch (error) {
		const message =
			error instanceof Error ? error.message : "Failed to get run diff";
		return NextResponse.json(
			{ success: false, error: message },
			{ status: 500 },
		);
	}
}
