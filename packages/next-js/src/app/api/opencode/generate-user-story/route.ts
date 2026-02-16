import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { taskRepo } from "@/server/repositories";
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

		const task = taskRepo.getById(body.taskId);
		if (!task) {
			return NextResponse.json(
				{ success: false, error: "Task not found" },
				{ status: 404 },
			);
		}

		const userStory = [
			"## User Story",
			`As a user, I want **${task.title}** so that I can achieve the intended outcome.`,
			"",
			"## Acceptance Criteria",
			"- [ ] Core behavior is implemented",
			"- [ ] Edge cases are handled",
			"- [ ] Result is validated in UI",
		].join("\n");

		taskRepo.update(task.id, { descriptionMd: userStory });

		const data: OpenCodeGenerateUserStoryResponse = { runId: randomUUID() };
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
