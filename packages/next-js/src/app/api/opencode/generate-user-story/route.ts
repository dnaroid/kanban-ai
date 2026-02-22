import { NextResponse } from "next/server";
import { runService } from "@/server/run/run-service";
import type { OpenCodeGenerateUserStoryResponse } from "@/types/ipc";

export async function POST(request: Request) {
	try {
		const body = (await request.json()) as {
			taskId?: unknown;
			taskIds?: unknown;
		};

		if (typeof body.taskId === "string" && body.taskId.trim().length > 0) {
			const { runId } = await runService.generateUserStory(body.taskId.trim());
			const data: OpenCodeGenerateUserStoryResponse = { runId };
			return NextResponse.json({ success: true, data });
		}

		if (!Array.isArray(body.taskIds)) {
			return NextResponse.json(
				{ success: false, error: "taskId or taskIds is required" },
				{ status: 400 },
			);
		}

		const taskIds = [...new Set(body.taskIds)]
			.filter((value): value is string => typeof value === "string")
			.map((value) => value.trim())
			.filter((value) => value.length > 0);

		if (taskIds.length === 0) {
			return NextResponse.json(
				{ success: false, error: "taskIds must contain at least one id" },
				{ status: 400 },
			);
		}

		const results = await Promise.all(
			taskIds.map((taskId) => runService.generateUserStory(taskId)),
		);
		const data = { runIds: results.map((result) => result.runId) };
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
