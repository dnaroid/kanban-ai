import { NextResponse } from "next/server";
import { runService } from "@/server/run/run-service";
import type { OpenCodeStartStoryChatResponse } from "@/types/ipc";

export async function POST(request: Request) {
	try {
		const body = (await request.json()) as {
			taskId?: unknown;
			prompt?: unknown;
		};

		if (typeof body.taskId !== "string" || body.taskId.trim().length === 0) {
			return NextResponse.json(
				{ success: false, error: "taskId is required" },
				{ status: 400 },
			);
		}

		if (typeof body.prompt !== "string" || body.prompt.trim().length === 0) {
			return NextResponse.json(
				{ success: false, error: "prompt is required" },
				{ status: 400 },
			);
		}

		const { runId } = await runService.startStoryChat(
			body.taskId.trim(),
			body.prompt.trim(),
		);
		const data: OpenCodeStartStoryChatResponse = { runId };
		return NextResponse.json({ success: true, data });
	} catch (error) {
		const message =
			error instanceof Error ? error.message : "Failed to start story chat";
		return NextResponse.json(
			{ success: false, error: message },
			{ status: 500 },
		);
	}
}
