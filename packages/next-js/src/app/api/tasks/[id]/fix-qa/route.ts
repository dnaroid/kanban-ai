import { NextRequest, NextResponse } from "next/server";
import { boardRepo, taskRepo } from "@/server/repositories";
import { getWorkflowColumnSystemKey } from "@/server/run/task-state-machine";
import { getRunsQueueManager } from "@/server/run/runs-queue-manager";
import type { Task } from "@/server/types";

interface RouteParams {
	params: Promise<{ id: string }>;
}

interface ExecutionBootstrapServiceAdapter {
	fixQaFailedTask(task: Task): Promise<boolean>;
}

export async function POST(_request: NextRequest, { params }: RouteParams) {
	try {
		const { id } = await params;

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
		const isQaFailed =
			task.status === "qa_failed" && currentColumnKey === "blocked";
		if (!isQaFailed) {
			return NextResponse.json(
				{ success: false, error: "Task is not in qa_failed state" },
				{ status: 400 },
			);
		}

		const bootstrapService = (
			getRunsQueueManager() as unknown as {
				executionBootstrapService: ExecutionBootstrapServiceAdapter;
			}
		).executionBootstrapService;

		const fixed = await bootstrapService.fixQaFailedTask(task);
		if (!fixed) {
			return NextResponse.json(
				{
					success: false,
					error: "No completed execution session found to resume",
				},
				{ status: 400 },
			);
		}

		const updatedTask = taskRepo.getById(id);
		return NextResponse.json({ success: true, data: updatedTask });
	} catch (error) {
		console.error("[API] Error fixing QA failure:", error);
		return NextResponse.json(
			{ success: false, error: "Failed to fix QA failure" },
			{ status: 500 },
		);
	}
}
