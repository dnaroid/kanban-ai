import { NextRequest, NextResponse } from "next/server";
import { boardRepo, taskRepo } from "@/server/repositories";
import { getTaskStateMachine } from "@/server/run/task-state-machine";
import type { TaskTransitionInput } from "@/server/run/task-state-machine";
import { getWorkflowColumnSystemKey } from "@/server/run/task-state-machine";
import { publishSseEvent } from "@/server/events/sse-broker";

interface RouteParams {
	params: Promise<{ id: string }>;
}

export async function POST(request: NextRequest, { params }: RouteParams) {
	try {
		const { id } = await params;
		const body = (await request.json()) as { qaReport?: string };
		const qaReport = body.qaReport;

		if (
			!qaReport ||
			typeof qaReport !== "string" ||
			qaReport.trim().length === 0
		) {
			return NextResponse.json(
				{
					success: false,
					error: "qaReport is required and must be a non-empty string",
				},
				{ status: 400 },
			);
		}

		const task = taskRepo.getById(id);
		if (!task) {
			return NextResponse.json(
				{ success: false, error: "Task not found" },
				{ status: 404 },
			);
		}

		const board = boardRepo.getById(task.boardId);
		if (!board) {
			return NextResponse.json(
				{ success: false, error: "Board not found" },
				{ status: 400 },
			);
		}

		const currentColumnKey = getWorkflowColumnSystemKey(board, task.columnId);
		const isReview = task.status === "done" && currentColumnKey === "review";
		if (!isReview) {
			return NextResponse.json(
				{ success: false, error: "Task is not in review state" },
				{ status: 400 },
			);
		}

		const transitionInput: TaskTransitionInput = {
			task: {
				id: task.id,
				boardId: task.boardId,
				status: task.status,
				columnId: task.columnId,
			},
			board,
			trigger: "review:reject",
			runKind: null,
			outcomeContent: "",
			hasSessionExisted: false,
			isManualStatusGracePeriod: false,
		};

		const sm = getTaskStateMachine();
		const result = sm.transition(transitionInput);

		if (result.action === "skip") {
			return NextResponse.json(
				{
					success: false,
					error: "Transition not allowed for current task state",
				},
				{ status: 400 },
			);
		}

		const patch: Record<string, unknown> = {
			qaReport,
			wasQaRejected: true,
			...result.patch,
		};

		const updatedTask = taskRepo.update(
			id,
			patch as Parameters<typeof taskRepo.update>[1],
		);

		if (!updatedTask) {
			return NextResponse.json(
				{ success: false, error: "Task not found after update" },
				{ status: 404 },
			);
		}

		publishSseEvent("task:event", {
			taskId: updatedTask.id,
			boardId: updatedTask.boardId,
			projectId: updatedTask.projectId,
			eventType: "task:updated",
			updatedAt: updatedTask.updatedAt,
		});

		return NextResponse.json({ success: true, data: updatedTask });
	} catch (error) {
		console.error("[API] Error rejecting task:", error);
		return NextResponse.json(
			{ success: false, error: "Failed to reject task" },
			{ status: 500 },
		);
	}
}
