import { NextRequest, NextResponse } from "next/server";
import { boardRepo, taskRepo } from "@/server/repositories";
import { publishSseEvent } from "@/server/events/sse-broker";
import {
	canTransitionColumn,
	canTransitionStatus,
	getDefaultStatusForWorkflowColumn,
	getWorkflowColumnSystemKey,
	isStatusAllowedInWorkflowColumn,
	isTaskStatus,
	resolveTaskStatusReasons,
} from "@/server/workflow/task-workflow-manager";

interface RouteParams {
	params: Promise<{ id: string }>;
}

export async function PUT(request: NextRequest, { params }: RouteParams) {
	try {
		const { id } = await params;
		const body = await request.json();
		const { columnId, toIndex } = body;

		if (!columnId) {
			return NextResponse.json(
				{ success: false, error: "columnId is required" },
				{ status: 400 },
			);
		}

		const existingTask = taskRepo.getById(id);
		if (!existingTask) {
			return NextResponse.json(
				{ success: false, error: "Task not found" },
				{ status: 404 },
			);
		}

		const board = boardRepo.getById(existingTask.boardId);
		if (!board) {
			return NextResponse.json(
				{ success: false, error: "Board not found" },
				{ status: 400 },
			);
		}

		const targetColumn = board.columns.find((column) => column.id === columnId);
		if (!targetColumn) {
			return NextResponse.json(
				{ success: false, error: "Column does not belong to board" },
				{ status: 400 },
			);
		}

		const currentColumnKey = getWorkflowColumnSystemKey(
			board,
			existingTask.columnId,
		);
		const targetColumnKey = getWorkflowColumnSystemKey(board, targetColumn.id);

		if (
			currentColumnKey &&
			targetColumnKey &&
			!canTransitionColumn(currentColumnKey, targetColumnKey)
		) {
			return NextResponse.json(
				{ success: false, error: "Column transition is not allowed" },
				{ status: 400 },
			);
		}

		const currentStatus = isTaskStatus(existingTask.status)
			? existingTask.status
			: null;
		let resolvedStatus = currentStatus;

		if (targetColumnKey) {
			if (resolvedStatus === null) {
				resolvedStatus = getDefaultStatusForWorkflowColumn(targetColumnKey);
			} else if (
				!isStatusAllowedInWorkflowColumn(resolvedStatus, targetColumnKey)
			) {
				const fallbackStatus = getDefaultStatusForWorkflowColumn(
					targetColumnKey,
					resolvedStatus,
				);

				if (!canTransitionStatus(resolvedStatus, fallbackStatus)) {
					return NextResponse.json(
						{
							success: false,
							error: "Status transition is not allowed for target column",
						},
						{ status: 400 },
					);
				}

				resolvedStatus = fallbackStatus;
			}
		}

		const movedTask = taskRepo.move(id, columnId, toIndex);
		if (!movedTask) {
			return NextResponse.json(
				{ success: false, error: "Task not found" },
				{ status: 404 },
			);
		}

		const patch: Parameters<typeof taskRepo.update>[1] = {};
		if (resolvedStatus !== null && movedTask.status !== resolvedStatus) {
			patch.status = resolvedStatus;
		}

		const effectiveStatus =
			resolvedStatus ??
			(isTaskStatus(movedTask.status) ? movedTask.status : null);
		if (effectiveStatus !== null) {
			const reasons = resolveTaskStatusReasons(
				effectiveStatus,
				targetColumnKey,
			);
			if (movedTask.blockedReason !== reasons.blockedReason) {
				patch.blockedReason = reasons.blockedReason;
			}
			if (movedTask.closedReason !== reasons.closedReason) {
				patch.closedReason = reasons.closedReason;
			}
		}

		const task =
			Object.keys(patch).length > 0
				? (taskRepo.update(movedTask.id, patch) ?? movedTask)
				: movedTask;

		if (!task) {
			return NextResponse.json(
				{ success: false, error: "Task not found" },
				{ status: 404 },
			);
		}

		publishSseEvent("task:event", {
			taskId: task.id,
			boardId: task.boardId,
			projectId: task.projectId,
			eventType: "task:moved",
			updatedAt: task.updatedAt,
		});

		return NextResponse.json({ success: true, data: task });
	} catch (error) {
		console.error("[API] Error moving task:", error);
		return NextResponse.json(
			{ success: false, error: "Failed to move task" },
			{ status: 500 },
		);
	}
}
