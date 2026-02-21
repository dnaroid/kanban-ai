import { NextResponse } from "next/server";
import { runService } from "@/server/run/run-service";
import type { OpenCodeStartQaTestingResponse } from "@/types/ipc";

export async function POST(request: Request) {
	try {
		const body = (await request.json()) as { taskId?: unknown };
		if (typeof body.taskId !== "string" || body.taskId.trim().length === 0) {
			return NextResponse.json(
				{ success: false, error: "taskId is required" },
				{ status: 400 },
			);
		}

		const { runId } = await runService.startQaTesting(body.taskId.trim());
		const data: OpenCodeStartQaTestingResponse = { runId };
		return NextResponse.json({ success: true, data });
	} catch (error) {
		const message =
			error instanceof Error
				? error.message
				: "Failed to start OpenCode QA testing";
		return NextResponse.json(
			{ success: false, error: message },
			{ status: 500 },
		);
	}
}
