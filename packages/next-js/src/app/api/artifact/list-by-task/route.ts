import { NextResponse } from "next/server";
import type { Artifact } from "@/types/ipc";
import { artifactRepo } from "@/server/repositories/artifact";

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

		const artifacts = artifactRepo.listByTask(taskId);
		const data: { artifacts: Artifact[] } = { artifacts };
		return NextResponse.json({ success: true, data });
	} catch (error) {
		const message =
			error instanceof Error
				? error.message
				: "Failed to list artifacts by task";
		return NextResponse.json(
			{ success: false, error: message },
			{ status: 500 },
		);
	}
}
