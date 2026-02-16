import { NextResponse } from "next/server";
import { runService } from "@/server/run/run-service";
import type { OpenCodeGenerateUserStoryResponse } from "@/types/ipc";

export async function POST(request: Request) {
	try {
		const body = (await request.json()) as { taskId?: unknown };
		if (typeof body.taskId !== "string" || body.taskId.trim().length === 0) {
			return NextResponse.json(
				{ success: false, error: "taskId is required" },
				{ status: 400 },
			);
		}

		const { runId } = await runService.generateUserStory(body.taskId);
		const data: OpenCodeGenerateUserStoryResponse = { runId };
		return NextResponse.json({ success: true, data });
	} catch (error) {
		const message =
			error instanceof Error
				? error.message
				: "Failed to generate OpenCode user story";
		return NextResponse.json(
			{ success: false, error: message },
			{ status: 500 },
		);
	}
}
