import { NextResponse } from "next/server";
import { runService } from "@/server/run/run-service";
import type { OpenCodeTriggerStoryChatGenerateResponse } from "@/types/ipc";

const storyChatRunKind = "task-story-chat";

export async function POST(request: Request) {
	try {
		const body = (await request.json()) as { runId?: unknown };
		if (typeof body.runId !== "string" || body.runId.trim().length === 0) {
			return NextResponse.json(
				{ success: false, error: "runId is required" },
				{ status: 400 },
			);
		}

		const runId = body.runId.trim();
		const run = runService.get(runId);
		if (!run) {
			return NextResponse.json(
				{ success: false, error: `Run not found: ${runId}` },
				{ status: 404 },
			);
		}

		if (run.metadata?.kind !== storyChatRunKind) {
			return NextResponse.json(
				{
					success: false,
					error: "Generate is only available for story-chat runs",
				},
				{ status: 400 },
			);
		}

		if (!run.sessionId?.trim()) {
			return NextResponse.json(
				{ success: false, error: "Run has no session ID" },
				{ status: 400 },
			);
		}

		await runService.triggerStoryGeneration(runId);

		const data: OpenCodeTriggerStoryChatGenerateResponse = { success: true };
		return NextResponse.json({ success: true, data });
	} catch (error) {
		const message =
			error instanceof Error
				? error.message
				: "Failed to trigger user story generation";
		return NextResponse.json(
			{ success: false, error: message },
			{ status: 500 },
		);
	}
}
