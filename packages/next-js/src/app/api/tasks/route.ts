import { NextRequest, NextResponse } from "next/server";
import { boardRepo, taskRepo } from "@/server/repositories";
import type { CreateTaskInput } from "@/server/types";
import {
	getDefaultStatusForWorkflowColumn,
	getWorkflowColumnSystemKey,
	isStatusAllowedInWorkflowColumn,
	isTaskStatus,
	resolveTaskStatusReasons,
} from "@/server/workflow/task-workflow-manager";

export async function GET(request: NextRequest) {
	try {
		const { searchParams } = new URL(request.url);
		const boardId = searchParams.get("boardId");

		if (!boardId) {
			return NextResponse.json(
				{ success: false, error: "boardId query parameter is required" },
				{ status: 400 },
			);
		}

		const tasks = taskRepo.listByBoard(boardId);
		return NextResponse.json({ success: true, data: tasks });
	} catch (error) {
		console.error("[API] Error fetching tasks:", error);
		return NextResponse.json(
			{ success: false, error: "Failed to fetch tasks" },
			{ status: 500 },
		);
	}
}

export async function POST(request: NextRequest) {
	try {
		const body = (await request.json()) as CreateTaskInput;

		if (!body.projectId || !body.boardId || !body.columnId || !body.title) {
			return NextResponse.json(
				{
					success: false,
					error: "projectId, boardId, columnId, and title are required",
				},
				{ status: 400 },
			);
		}

		const board = boardRepo.getById(body.boardId);
		if (!board) {
			return NextResponse.json(
				{ success: false, error: "Board not found" },
				{ status: 400 },
			);
		}

		const targetColumn = board.columns.find(
			(column) => column.id === body.columnId,
		);
		if (!targetColumn) {
			return NextResponse.json(
				{ success: false, error: "Column does not belong to board" },
				{ status: 400 },
			);
		}

		const initialStatus = body.status ?? "queued";
		if (!isTaskStatus(initialStatus)) {
			return NextResponse.json(
				{ success: false, error: "Unsupported task status" },
				{ status: 400 },
			);
		}

		let resolvedStatus = initialStatus;
		const targetColumnKey = getWorkflowColumnSystemKey(board, targetColumn.id);
		if (
			targetColumnKey &&
			!isStatusAllowedInWorkflowColumn(resolvedStatus, targetColumnKey)
		) {
			if (body.status !== undefined) {
				return NextResponse.json(
					{
						success: false,
						error: "Provided status is not allowed in target workflow column",
					},
					{ status: 400 },
				);
			}

			resolvedStatus = getDefaultStatusForWorkflowColumn(
				targetColumnKey,
				resolvedStatus,
			);
		}

		const reasons = resolveTaskStatusReasons(resolvedStatus, targetColumnKey);

		const task = taskRepo.create({
			projectId: body.projectId,
			boardId: body.boardId,
			columnId: body.columnId,
			title: body.title,
			description: body.description,
			status: resolvedStatus,
			blockedReason: reasons.blockedReason,
			closedReason: reasons.closedReason,
			priority: body.priority ?? "normal",
			difficulty: body.difficulty ?? "medium",
			type: body.type ?? "task",
			tags: body.tags,
			dueDate: body.dueDate,
			modelName: body.modelName,
		});

		return NextResponse.json({ success: true, data: task });
	} catch (error) {
		console.error("[API] Error creating task:", error);
		return NextResponse.json(
			{ success: false, error: "Failed to create task" },
			{ status: 500 },
		);
	}
}
