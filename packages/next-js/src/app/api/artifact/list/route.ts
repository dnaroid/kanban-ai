import { NextResponse } from "next/server";
import type { Artifact } from "@/types/ipc";
import { artifactRepo } from "@/server/repositories/artifact";

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

		const artifacts = artifactRepo.listByRun(runId);
		const data: { artifacts: Artifact[] } = { artifacts };
		return NextResponse.json({ success: true, data });
	} catch (error) {
		const message =
			error instanceof Error ? error.message : "Failed to list artifacts";
		return NextResponse.json(
			{ success: false, error: message },
			{ status: 500 },
		);
	}
}
